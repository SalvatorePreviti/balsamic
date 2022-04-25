import type { Abortable } from "events";
import child_process from "child_process";
import { DevLogTimeOptions } from "../dev-log";
import { ChildProcessWrapper } from "./child-process-wrapper";
import { abortSignals } from "../promises/abort-signals";
import { NodeResolver } from "../modules";
import { killProcessChildren } from "./lib/kill-process-children";

const { isArray } = Array;

export interface SpawnOptions
  extends DevLogTimeOptions,
    ChildProcessWrapper.Options,
    Abortable,
    child_process.SpawnOptions {}

export interface ForkOptions
  extends DevLogTimeOptions,
    ChildProcessWrapper.Options,
    Abortable,
    child_process.ForkOptions {}

export interface SpawnOrForkOptions extends SpawnOptions, ForkOptions {}

export type SpawnArg =
  | string
  | null
  | undefined
  | number
  | false
  | readonly (string | null | undefined | number | false)[];

export const childProcess = {
  defaultOptions: {
    stdio: "inherit",
    env: process.env,
    throwOnExitCode: true,
    timed: true,
  } as Omit<SpawnOrForkOptions, "title">,

  normalizeArgs,
  extractSpawnOptions,
  spawn,
  fork,
  runModuleBin,
  npmRun,
  npmCommand,
  killProcessChildren,
};

function normalizeArgs(args: readonly SpawnArg[] | null | undefined): string[] {
  if (args === null || args === undefined) {
    return [];
  }
  const result: string[] = [];
  const append = (array: readonly SpawnArg[], level: number) => {
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
}

function extractSpawnOptions<TOptions extends SpawnOptions | ForkOptions>(
  inputArgs: readonly SpawnArg[] | undefined,
  command: string,
  options: TOptions | null | undefined,
) {
  const args = childProcess.normalizeArgs(inputArgs);
  const cmd = [command, ...args].join(" ");
  const opts = { ...childProcess.defaultOptions, ...options };
  if (typeof opts.title !== "string") {
    opts.title = cmd.length < 40 ? cmd : command;
  }
  if (typeof opts.cwd !== "string") {
    opts.cwd = process.cwd();
  }
  const signal = "signal" in opts ? opts.signal : abortSignals.getSignal(opts.signal);
  opts.signal = undefined;
  return { command, args, opts, signal };
}

/** Spawn a new process, redirect stdio and await for completion. */
function spawn(command: string, inputArgs?: readonly SpawnArg[], options?: SpawnOptions | null) {
  const { args, opts, signal } = childProcess.extractSpawnOptions(inputArgs, command, options);
  return new ChildProcessWrapper(
    () => {
      return { childProcess: child_process.spawn(command, args, opts) };
    },
    opts,
    signal,
  );
}

/** Forks the node process that runs the given module, redirect stdio and await for completion. */
function fork(moduleId: string, inputArgs?: readonly SpawnArg[], options?: ForkOptions | null) {
  const { opts, args, signal } = childProcess.extractSpawnOptions(inputArgs, moduleId, options);
  return new ChildProcessWrapper(
    () => {
      return { childProcess: child_process.fork(moduleId, args, opts) };
    },
    opts,
    signal,
  );
}

/** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
function runModuleBin(
  moduleId: string,
  executableId: string,
  inputArgs: readonly SpawnArg[] = [],
  options?: ForkOptions,
) {
  options = { ...options };
  if (typeof options.title !== "string") {
    options = { ...options, title: moduleId !== executableId ? `${moduleId}:${executableId}` : moduleId };
  }
  const { opts, args, signal } = childProcess.extractSpawnOptions(inputArgs, moduleId, options);

  return new ChildProcessWrapper(
    () => {
      const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, opts.cwd);
      if (!resolved) {
        throw new Error(`runModuleBin: Could not find ${moduleId}:${executableId}`);
      }
      return { childProcess: child_process.fork(resolved, args, opts) };
    },
    opts,
    signal,
  );
}

/** Executes npm run <command> [args] */
function npmRun(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions) {
  options = { title: `npm run ${command}`, ...options };
  return childProcess.spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command, ...args], options);
}

/** Executes npm <command> [args] */
function npmCommand(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions) {
  options = { title: `npm ${command}`, ...options };
  return childProcess.spawn(process.platform === "win32" ? "npm.cmd" : "npm", [command, ...args], options);
}
