import type { Abortable } from "events";
import child_process from "child_process";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { ChildProcessWrapper } from "./child-process-wrapper";
import { abortSignals } from "../promises/abort-signals";
import { NodeResolver } from "../modules";
import { killProcessChildren } from "./lib/kill-process-children";

const { isArray } = Array;

export interface SpawnCommonOptions extends DevLogTimeOptions, ChildProcessWrapper.Options, Abortable {}

export interface SpawnOptions extends SpawnCommonOptions, child_process.SpawnOptions {}

export interface ForkOptions extends SpawnCommonOptions, child_process.ForkOptions {}

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
  } as Omit<SpawnCommonOptions, "title" | "caller" | "signal">,

  normalizeArgs,
  extractSpawnOptions,
  spawn,
  fork,
  runModuleBin,
  npmRun,
  npmCommand,
  forceGlobalSpawnOptions,
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
  const signal = abortSignals.getSignal(opts.signal);
  opts.signal = undefined;
  return { command, args, opts, signal };
}

/** Spawn a new process, redirect stdio and await for completion. */
function spawn(command: string, inputArgs?: readonly SpawnArg[], options?: SpawnOptions | null) {
  return new ChildProcessWrapper(() => {
    const { args, opts, signal } = childProcess.extractSpawnOptions(inputArgs, command, options);
    if (!opts.caller) {
      opts.caller = spawn;
    }
    return { childProcess: child_process.spawn(command, args, opts), options: opts, abortSignal: signal };
  });
}

/** Forks the node process that runs the given module, redirect stdio and await for completion. */
function fork(moduleId: string, inputArgs?: readonly SpawnArg[], options?: ForkOptions | null) {
  return new ChildProcessWrapper(() => {
    const { opts, args, signal } = childProcess.extractSpawnOptions(inputArgs, moduleId, options);
    if (!opts.caller) {
      opts.caller = fork;
    }
    return { childProcess: child_process.fork(moduleId, args, opts), options: opts, abortSignal: signal };
  });
}

/** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
function runModuleBin(
  moduleId: string,
  executableId: string,
  inputArgs: readonly SpawnArg[] = [],
  options?: ForkOptions,
) {
  return new ChildProcessWrapper(() => {
    options = { ...options };
    if (typeof options.title !== "string") {
      options.title = `${moduleId}:${executableId}`;
    }
    const resolved = NodeResolver.default.resolvePackageBin(moduleId, executableId, options.cwd);
    if (!resolved) {
      throw new Error(`Could not find ${moduleId}:${executableId}`);
    }

    const { opts, args, signal } = childProcess.extractSpawnOptions(inputArgs, moduleId, options);
    if (!opts.caller) {
      opts.caller = runModuleBin;
    }
    return { childProcess: child_process.fork(moduleId, args, opts), options: opts, abortSignal: signal };
  });
}

/** Executes npm run <command> [args] */
function npmRun(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions) {
  options = { title: `npm run ${command}`, ...options };
  if (!options.caller) {
    options.caller = npmRun;
  }
  return childProcess.spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", command, ...args], options);
}

/** Executes npm <command> [args] */
function npmCommand(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions) {
  options = { title: `npm ${command}`, ...options };
  if (!options.caller) {
    options.caller = npmCommand;
  }
  return childProcess.spawn(process.platform === "win32" ? "npm.cmd" : "npm", [command, ...args], options);
}

let _spawnOverridden: boolean;

/**
 * Overrides nodejs process child options.
 * This can be useful to change some attributes in child process spawned by external packages.
 * Passing __debug:true will also print print debug information of every process started.
 */
function forceGlobalSpawnOptions(
  forcedOptions: SpawnOptions & ForkOptions & child_process.SpawnOptionsWithoutStdio & { __debug?: boolean },
) {
  Object.assign(forceGlobalSpawnOptions.options, forcedOptions);
  if (_spawnOverridden) {
    return;
  }
  _spawnOverridden = true;

  const _spawn = child_process.spawn;
  const _fork = child_process.fork;

  const _spawnSync = child_process.spawnSync;

  child_process.spawn = function (command: string, args?: any, options?: any) {
    if (Array.isArray(args)) {
      if (forceGlobalSpawnOptions.options!.__debug) {
        devLog.debug("spawn", { command, args, options: { ...options, env: "[env]" } });
      }
      return _spawn(command, args, { ...options, ...forceGlobalSpawnOptions.options });
    }
    if (forceGlobalSpawnOptions.options!.__debug) {
      devLog.debug("spawn", { command, options: { ...args, env: "[env]" } });
    }
    return _spawn(command, { ...args, ...forceGlobalSpawnOptions.options });
  } as any;

  child_process.spawnSync = function (command: string, args?: any, options?: any) {
    if (Array.isArray(args)) {
      if (forceGlobalSpawnOptions.options!.__debug) {
        devLog.debug("spawnSync", { command, args, options: { ...options, env: "[env]" } });
      }
      return _spawnSync(command, args, { ...options, ...forceGlobalSpawnOptions.options });
    }
    if (forceGlobalSpawnOptions.options!.__debug) {
      devLog.debug("spawnSync", { command, options: { ...args, env: "[env]" } });
    }
    return _spawnSync(command, { ...args, ...forceGlobalSpawnOptions.options });
  } as any;

  child_process.fork = function (command: string, args?: any, options?: any) {
    if (Array.isArray(args)) {
      if (forceGlobalSpawnOptions.options!.__debug) {
        devLog.debug("fork", { command, args, options: { ...options, env: "[env]" } });
      }
      return _fork(command, args, { ...options, ...forceGlobalSpawnOptions.options });
    }
    if (forceGlobalSpawnOptions.options!.__debug) {
      devLog.debug("fork", { command, options: { ...args, env: "[env]" } });
    }
    return _fork(command, { ...args, ...forceGlobalSpawnOptions.options });
  } as any;
}

forceGlobalSpawnOptions.options = {} as SpawnOptions &
  ForkOptions &
  child_process.SpawnOptionsWithoutStdio & { __debug?: boolean };
