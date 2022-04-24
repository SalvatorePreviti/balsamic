import child_process from "child_process";
import { NodeResolver } from "../modules/node-resolver";
import { ChildProcessPromise, ChildProcessWrapper } from "./child-process-wrapper";
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

  /** Spawn a new process, redirect stdio and await for completion. */
  spawn(
    command: string,
    inputArgs?: readonly devChildTask.SpawnArg[],
    options?: devChildTask.SpawnOptions | null,
  ): ChildProcessPromise {
    return new ChildProcessWrapper(() => {
      const { args, opts, signal } = devChildTask.extractSpawnOptions(inputArgs, command, options);
      if (!opts.caller) {
        opts.caller = devChildTask.spawn;
      }
      return { childProcess: child_process.spawn(command, args, opts), options: opts, abortSignal: signal };
    }).promise();
  },

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  fork(
    moduleId: string,
    inputArgs?: readonly devChildTask.SpawnArg[],
    options?: devChildTask.ForkOptions | null,
  ): ChildProcessPromise {
    return new ChildProcessWrapper(() => {
      const { opts, args, signal } = devChildTask.extractSpawnOptions(inputArgs, moduleId, options);
      if (!opts.caller) {
        opts.caller = devChildTask.fork;
      }
      return { childProcess: child_process.fork(moduleId, args, opts), options: opts, abortSignal: signal };
    }).promise();
  },

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  runModuleBin(
    moduleId: string,
    executableId: string,
    inputArgs: readonly devChildTask.SpawnArg[] = [],
    options?: devChildTask.ForkOptions,
  ): ChildProcessPromise {
    return new ChildProcessWrapper(() => {
      options = { ...options };
      if (typeof options.title !== "string") {
        options.title = `${moduleId}:${executableId}`;
      }
      const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, options.cwd);
      if (!resolved) {
        throw new Error(`Could not find ${moduleId}:${executableId}`);
      }

      const { opts, args, signal } = devChildTask.extractSpawnOptions(inputArgs, moduleId, options);
      return { childProcess: child_process.fork(moduleId, args, opts), options: opts, abortSignal: signal };
    }).promise();
  },

  /** Executes npm run <command> [args] */
  npmRun(
    command: string,
    args: readonly devChildTask.SpawnArg[] = [],
    options?: devChildTask.SpawnOptions,
  ): ChildProcessPromise {
    options = { title: `npm run ${command}`, ...options };
    return devChildTask.spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command, ...args], options);
  },

  /** Executes npm <command> [args] */
  npmCommand(
    command: string,
    args: readonly devChildTask.SpawnArg[] = [],
    options?: devChildTask.SpawnOptions,
  ): ChildProcessPromise {
    options = { title: `npm ${command}`, ...options };
    return devChildTask.spawn(process.platform === "win32" ? "npm.cmd" : "npm", [command, ...args], options);
  },
};
