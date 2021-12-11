import child_process from 'child_process'
import { devError } from '../dev-error'
import { devLog } from '../dev-log'
import type { DevLogTimeOptions } from '../dev-log'
import { NodeResolver } from '..'

export namespace devChildTask {
  export type Arg = string | null | undefined | number | false | readonly (string | null | undefined | number | false)[]

  export interface CommonOptions extends DevLogTimeOptions {
    title?: string
    showStack?: boolean
    abort?: AbortSignal | AbortController
  }

  export interface SpawnOptions extends CommonOptions, child_process.SpawnOptions {}
  export interface ForkOptions extends CommonOptions, child_process.ForkOptions {}
}

export const devChildTask = {
  normalizeArgs(args: readonly devChildTask.Arg[]): string[] {
    const result: string[] = []
    const append = (array: readonly devChildTask.Arg[], level: number) => {
      for (const arg of array) {
        if (arg !== null && arg !== undefined && arg !== false) {
          if (Array.isArray(arg)) {
            if (level > 8) {
              throw new Error('getDevChildTaskArgs array overflow')
            }
            append(arg, level + 1)
          } else {
            result.push(typeof arg !== 'string' ? `${arg}` : arg)
          }
        }
      }
    }
    append(args, 0)
    return result
  },

  /** Spawn a new process, redirect stdio and await for completion. */
  async spawn(command: string, inputArgs: readonly devChildTask.Arg[] = [], options?: devChildTask.SpawnOptions) {
    const args = devChildTask.normalizeArgs(inputArgs)
    const cmd = [command, ...args].join(' ')
    const title = (options && options.title) || (cmd.length < 40 ? cmd : command)
    const exitError = new Error(`Child process "${title}" failed`)
    if (options && options.showStack !== undefined) {
      exitError.showStack = options.showStack
    }
    const spawn = () =>
      _awaitChildProcess(
        child_process.spawn(command, args, { env: process.env, stdio: 'inherit', ...options }),
        cmd,
        exitError,
        options && options.abort
      )
    return devLog.timed(title, spawn, options)
  },

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  async fork(moduleId: string, inputArgs: readonly devChildTask.Arg[] = [], options?: devChildTask.ForkOptions) {
    const args = devChildTask.normalizeArgs(inputArgs)
    const cmd = [moduleId, ...args].join(' ')
    const title = (options && options.title) || (cmd.length < 40 ? cmd : moduleId)
    const exitError = new Error(`Child process "${title}" failed`)
    if (options && options.showStack !== undefined) {
      exitError.showStack = options.showStack
    }
    const fork = () =>
      _awaitChildProcess(
        child_process.fork(moduleId, devChildTask.normalizeArgs(args), {
          env: process.env,
          stdio: 'inherit',
          ...options
        }),
        cmd,
        exitError,
        options && options.abort
      )
    return devLog.timed(title, fork, options)
  },

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  async runModuleBin(
    moduleId: string,
    executableId: string,
    args: readonly devChildTask.Arg[] = [],
    options: devChildTask.ForkOptions = {}
  ) {
    const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, options.cwd)
    if (!resolved) {
      throw new Error(`Could not find ${moduleId}:${executableId}`)
    }
    return devChildTask.fork(resolved, args, options)
  },

  /** Executes npm run <command> [args] */
  async npmRun(command: string, args: readonly devChildTask.Arg[] = [], options?: devChildTask.SpawnOptions) {
    return devChildTask.spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command, ...args], options)
  }
}

function _awaitChildProcess(
  childProcess: child_process.ChildProcess,
  cmd: string,
  exitError: Error,
  abortSignal: AbortSignal | AbortController | undefined
): Promise<void> {
  if (abortSignal && 'signal' in abortSignal) {
    abortSignal = abortSignal.signal
  }

  const result = new Promise<void>((resolve, reject) => {
    let completed = false
    let abort: false | null | (() => void) = false
    let exitCode: string | number | null

    if (abortSignal) {
      abort = () => {
        abort = null
        if (!completed) {
          childProcess.kill('SIGINT')
        }
      }
      ;(abortSignal as AbortSignal).addEventListener('abort', abort)
    }

    const onError = (error: any) => {
      if (!completed) {
        if (abortSignal && abort) {
          ;(abortSignal as AbortSignal).removeEventListener('abort', abort)
        }
        error = devError(error, onError)

        let stack = exitError.stack || `${cmd} failed\n`
        if (exitCode && !stack.includes(' exitCode:')) {
          stack = stack.replace('\n', ` exitCode:${exitCode}\n`)
        }
        exitError.stack = stack

        error.cmd = cmd
        completed = true
        reject(error)
      }
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (abortSignal && abort) {
        ;(abortSignal as AbortSignal).removeEventListener('abort', abort)
      }
      if (!code && !signal && abort === null) {
        code = null
        signal = 'SIGINT'
      }
      if (code || code === null) {
        exitCode = code || signal || 'FAILED'
        exitError.exitCode = exitCode
        onError(exitError)
      } else if (!completed) {
        completed = true
        resolve()
      }
    }
    childProcess.on('error', onError)
    childProcess.on('exit', onExit)
  })

  return result
}
