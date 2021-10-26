import child_process from 'child_process'
import { devError } from './dev-error'
import { devLog } from './dev-log'
import type { DevLogTimeOptions } from './dev-log'
import { NodeResolver } from '..'

type DevChildTaskArg =
  | string
  | null
  | undefined
  | number
  | false
  | readonly (string | null | undefined | number | false)[]

function getDevChildTaskArgs(args: readonly DevChildTaskArg[]): string[] {
  const result: string[] = []
  const append = (array: readonly DevChildTaskArg[], level: number) => {
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
}

export const devChildTask = {
  /** Spawn a new process, redirect stdio and await for completion. */
  async spawn(
    command: string,
    inputArgs: readonly DevChildTaskArg[] = [],
    options?: child_process.SpawnOptions & { title?: string; showStack?: boolean } & DevLogTimeOptions
  ) {
    const args = getDevChildTaskArgs(inputArgs)
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
        exitError
      )
    return devLog.timed(title, spawn, options)
  },

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  async fork(
    moduleId: string,
    inputArgs: readonly DevChildTaskArg[] = [],
    options?: child_process.ForkOptions & { title?: string; showStack?: boolean } & DevLogTimeOptions
  ) {
    const args = getDevChildTaskArgs(inputArgs)
    const cmd = [moduleId, ...args].join(' ')
    const title = (options && options.title) || (cmd.length < 40 ? cmd : moduleId)
    const exitError = new Error(`Child process "${title}" failed`)
    if (options && options.showStack !== undefined) {
      exitError.showStack = options.showStack
    }
    const fork = () =>
      _awaitChildProcess(
        child_process.fork(moduleId, getDevChildTaskArgs(args), { env: process.env, stdio: 'inherit', ...options }),
        cmd,
        exitError
      )
    return devLog.timed(title, fork, options)
  },

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  async runModuleBin(
    moduleId: string,
    executableId: string,
    args: readonly DevChildTaskArg[] = [],
    options: child_process.ForkOptions & {
      title?: string
      showStack?: boolean
    } & DevLogTimeOptions = {}
  ) {
    const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, options.cwd)
    if (!resolved) {
      throw new Error(`Could not find ${moduleId}:${executableId}`)
    }
    return devChildTask.fork(resolved, args, options)
  },

  /** Executes npm run <command> [args] */
  async npmRun(
    command: string,
    args: readonly DevChildTaskArg[] = [],
    options: child_process.SpawnOptions & {
      title?: string
      showStack?: boolean
    } & DevLogTimeOptions = {}
  ) {
    return devChildTask.spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command, ...args], options)
  }
}

function _awaitChildProcess(childProcess: child_process.ChildProcess, cmd: string, exitError: Error): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let completed = false
    const onError = (error: any) => {
      if (!completed) {
        error = devError(error, onError)
        error.cmd = cmd
        completed = true
        reject(error)
      }
    }
    const onExit = (exitCode: number) => {
      if (exitCode) {
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
}
