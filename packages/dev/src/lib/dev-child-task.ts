import child_process from 'child_process'
import { devError } from './dev-error'
import { devLog } from './dev-log'
import type { DevLogTimeOptions } from './dev-log'
import { resolveModuleBin } from '../modules/resolve'

export const devChildTask = {
  /** Spawn a new process, redirect stdio and await for completion. */
  async spawn(
    command: string,
    args: readonly string[] = [],
    options?: child_process.SpawnOptions & { title?: string; showStack?: boolean } & DevLogTimeOptions
  ) {
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
    args: readonly string[] = [],
    options?: child_process.ForkOptions & { title?: string; showStack?: boolean } & DevLogTimeOptions
  ) {
    const cmd = [moduleId, ...args].join(' ')
    const title = (options && options.title) || (cmd.length < 40 ? cmd : moduleId)
    const exitError = new Error(`Child process "${title}" failed`)
    if (options && options.showStack !== undefined) {
      exitError.showStack = options.showStack
    }
    const fork = () =>
      _awaitChildProcess(
        child_process.fork(moduleId, args, { env: process.env, stdio: 'inherit', ...options }),
        cmd,
        exitError
      )
    return devLog.timed(title, fork, options)
  },

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  async runModuleBin(
    moduleId: string,
    executableId: string,
    args: readonly string[] = [],
    options: child_process.ForkOptions & {
      title?: string
      showStack?: boolean
    } & DevLogTimeOptions = {}
  ) {
    return devChildTask.fork(resolveModuleBin(moduleId, executableId, options.cwd), args, options)
  },

  /** Executes npm run <command> [args] */
  async npmRun(
    command: string,
    args: readonly string[] = [],
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
