/// <reference path="../types/modules.ts" />
import type child_process from "node:child_process";
import type {
  SpawnOrForkOptions as childProcess_SpawnOrForkOptions,
  SpawnOptions as childProcesses_SpawnOptions,
  ForkOptions as childProcess_ForkOptions,
  SpawnArg as childProcess_SpawnArg,
  ChildProcessPromise,
} from "./child-process-wrapper";
import { ChildProcessWrapper } from "./child-process-wrapper";
import _which from "which";

export namespace devChildTask {
  export type SpawnOptions = childProcesses_SpawnOptions;

  export type ForkOptions = childProcess_ForkOptions;

  export type SpawnOrForkOptions = childProcess_SpawnOrForkOptions;

  export type SpawnArg = childProcess_SpawnArg;

  export type ChildProcess = child_process.ChildProcess;

  export type ChildProcessStartedHandler = (process: ChildProcess) => void;

  export namespace which {
    export type OptionsAll = _which.OptionsAll;
    export type OptionsFirst = _which.OptionsFirst;
    export type OptionsNoThrow = _which.OptionsNoThrow;
    export type OptionsThrow = _which.OptionsThrow;
    export type AsyncOptions = _which.AsyncOptions;
    export type Options = _which.Options;
  }
}

export const devChildTask = {
  ...ChildProcessWrapper,

  spawn,
  fork,
  runModuleBin,
  npmRun,
  npmCommand,
  npm,

  /** Finds all instances of a specified executable in the PATH environment variable */
  which: _which,
};

/** Spawn a new process, redirect stdio and await for completion. */
function spawn(
  command: string,
  inputArgs?: readonly devChildTask.SpawnArg[] | undefined,
  options?: devChildTask.SpawnOptions | null | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.spawn(command, inputArgs, options).promise();
}

/** Forks the node process that runs the given module, redirect stdio and await for completion. */
function fork(
  moduleId: string,
  inputArgs?: readonly devChildTask.SpawnArg[] | undefined,
  options?: devChildTask.ForkOptions | null | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.fork(moduleId, inputArgs, options).promise();
}

/** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
function runModuleBin(
  moduleId: string,
  executableId: string,
  inputArgs: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.ForkOptions | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.runModuleBin(moduleId, executableId, inputArgs, options).promise();
}

/** Executes npm run <command> [args] */
function npmRun(
  command: string,
  args: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.SpawnOptions | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.npmRun(command, args, options).promise();
}

/** Executes npm <command> [args] */
function npmCommand(
  command: string,
  args: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.SpawnOptions | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.npmCommand(command, args, options).promise();
}

/** Executes npm [args] */
function npm(
  args: readonly devChildTask.SpawnArg[] = [],
  options?: devChildTask.SpawnOptions | undefined,
): ChildProcessPromise {
  return ChildProcessWrapper.npm(args, options).promise();
}
