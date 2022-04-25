import child_process from "child_process";
import { ChildProcessPromise } from "./child-process-wrapper";
import {
  childProcess,
  SpawnOrForkOptions as childProcess_SpawnOrForkOptions,
  SpawnOptions as childProcesses_SpawnOptions,
  ForkOptions as childProcess_ForkOptions,
  SpawnArg as childProcess_SpawnArg,
} from "./child-process";

export namespace devChildTask {
  export type SpawnOptions = childProcesses_SpawnOptions;

  export type ForkOptions = childProcess_ForkOptions;

  export type SpawnOrForkOptions = childProcess_SpawnOrForkOptions;

  export type SpawnArg = childProcess_SpawnArg;

  export type ChildProcess = child_process.ChildProcess;

  export type ChildProcessStartedHandler = (process: ChildProcess) => void;
}

export const devChildTask = {
  ...childProcess,

  spawn,
  fork,
  runModuleBin,
  npmRun,
  npmCommand,
};

/** Spawn a new process, redirect stdio and await for completion. */
function spawn(
  command: string,
  inputArgs?: readonly devChildTask.SpawnArg[],
  options?: devChildTask.SpawnOptions | null,
): ChildProcessPromise {
  return childProcess.spawn(command, inputArgs, options).promise();
}

/** Forks the node process that runs the given module, redirect stdio and await for completion. */
function fork(
  moduleId: string,
  inputArgs?: readonly devChildTask.SpawnArg[],
  options?: devChildTask.ForkOptions | null,
): ChildProcessPromise {
  return childProcess.fork(moduleId, inputArgs, options).promise();
}

/** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
function runModuleBin(
  moduleId: string,
  executableId: string,
  inputArgs: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.ForkOptions,
): ChildProcessPromise {
  return childProcess.runModuleBin(moduleId, executableId, inputArgs, options).promise();
}

/** Executes npm run <command> [args] */
function npmRun(
  command: string,
  args: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.SpawnOptions,
): ChildProcessPromise {
  return childProcess.npmRun(command, args, options).promise();
}

/** Executes npm <command> [args] */
function npmCommand(
  command: string,
  args: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.SpawnOptions,
): ChildProcessPromise {
  return childProcess.npmCommand(command, args, options).promise();
}
