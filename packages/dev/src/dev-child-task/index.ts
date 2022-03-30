import child_process from "child_process";
import type { DevLogTimeOptions } from "../dev-log";
import { NodeResolver } from "../modules/node-resolver";
import { ProcessPromise, ProcessPromiseResult as _ProcessPromiseResult } from "./process-promise";

export { ProcessPromise, _ProcessPromiseResult as ProcessPromiseResult };

const { isArray } = Array;

export namespace devChildTask {
  export interface CommonOptions extends DevLogTimeOptions {
    title?: string;

    /** Overrides the showStack property in case of error */
    showStack?: boolean;

    /** Throws if exitCode is non zero or a signal was raised. Default is true. */
    throwOnExitCode?: boolean;
  }

  export interface SpawnOptions extends CommonOptions, child_process.SpawnOptions {}

  export interface ForkOptions extends CommonOptions, child_process.ForkOptions {}

  export type ProcessPromiseResult = _ProcessPromiseResult;

  export type ChildProcess = child_process.ChildProcess;

  export type ChildProcessStartedHandler = (process: ChildProcess) => void;

  export type Arg =
    | string
    | null
    | undefined
    | number
    | false
    | readonly (string | null | undefined | number | false)[];
}

export const devChildTask = {
  defaultOptions: {
    stdio: "inherit",
    env: process.env,
    throwOnExitCode: true,
    timed: true,
  } as Omit<devChildTask.CommonOptions, "title">,

  normalizeArgs(args: readonly devChildTask.Arg[] | null | undefined): string[] {
    if (args === null || args === undefined) {
      return [];
    }
    const result: string[] = [];
    const append = (array: readonly devChildTask.Arg[], level: number) => {
      for (const arg of array) {
        if (arg !== null && arg !== undefined && arg !== false) {
          if (isArray(arg)) {
            if (level > 8) {
              throw new Error("getDevChildTaskArgs array overflow");
            }
            append(arg, level + 1);
          } else {
            result.push(typeof arg !== "string" ? `${arg}` : arg);
          }
        }
      }
    };
    append(args, 0);
    return result;
  },

  /** Spawn a new process, redirect stdio and await for completion. */
  spawn(
    command: string,
    inputArgs?: readonly devChildTask.Arg[],
    options?: devChildTask.SpawnOptions | null,
  ): ProcessPromise {
    try {
      const args = devChildTask.normalizeArgs(inputArgs);
      const cmd = [command, ...args].join(" ");
      const opts = { ...devChildTask.defaultOptions, ...options };
      if (typeof opts.title !== "string") {
        opts.title = cmd.length < 40 ? cmd : command;
      }
      if (typeof opts.cwd !== "string") {
        opts.cwd = process.cwd();
      }
      return new ProcessPromise(() => child_process.spawn(command, args, opts), opts);
    } catch (error) {
      return ProcessPromise.rejectProcessPromise(error);
    }
  },

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  fork(
    moduleId: string,
    inputArgs?: readonly devChildTask.Arg[],
    options?: devChildTask.ForkOptions | null,
  ): ProcessPromise {
    try {
      const args = devChildTask.normalizeArgs(inputArgs);
      const cmd = [moduleId, ...args].join(" ");
      const opts = { ...devChildTask.defaultOptions, ...options };
      if (typeof opts.title !== "string") {
        opts.title = cmd.length < 40 ? cmd : moduleId;
      }
      if (typeof opts.cwd !== "string") {
        opts.cwd = process.cwd();
      }
      return new ProcessPromise(() => child_process.fork(moduleId, args, opts), opts);
    } catch (error) {
      return ProcessPromise.rejectProcessPromise(error);
    }
  },

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  runModuleBin(
    moduleId: string,
    executableId: string,
    args: readonly devChildTask.Arg[] = [],
    options?: devChildTask.ForkOptions,
  ): ProcessPromise {
    try {
      options = { ...options };
      if (typeof options.title !== "string") {
        options.title = `${moduleId}:${executableId}`;
      }
      const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, options.cwd);
      if (!resolved) {
        return ProcessPromise.rejectProcessPromise(new Error(`Could not find ${moduleId}:${executableId}`));
      }
      return devChildTask.fork(resolved, args, options);
    } catch (error) {
      return ProcessPromise.rejectProcessPromise(error);
    }
  },

  /** Executes npm run <command> [args] */
  npmRun(command: string, args: readonly devChildTask.Arg[] = [], options?: devChildTask.SpawnOptions): ProcessPromise {
    options = { title: `npm run ${command}`, ...options };
    return devChildTask.spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command, ...args], options);
  },

  /** Executes npm <command> [args] */
  npmCommand(
    command: string,
    args: readonly devChildTask.Arg[] = [],
    options?: devChildTask.SpawnOptions,
  ): ProcessPromise {
    options = { title: `npm ${command}`, ...options };
    return devChildTask.spawn(process.platform === "win32" ? "npm.cmd" : "npm", [command, ...args], options);
  },

  ProcessPromise,
  ProcessPromiseResult: _ProcessPromiseResult,
};
