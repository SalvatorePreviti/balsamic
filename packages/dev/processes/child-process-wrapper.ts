import util from "util";
import child_process from "child_process";

import type { Abortable } from "events";
import type { InterfaceFromClass, UnsafeAny } from "../types";
import type { Deferred } from "../promises/deferred";
import type { PackageManager } from "../package-json/package-json-type";
import type { ServicesRunner } from "../promises/services-runner";
import { type DevLogTimedOptions, DevLogTimed, devLog } from "../dev-log";

import { noop } from "../utils/utils";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import { abortSignals } from "../promises/abort-signals";
import { NodeResolver } from "../modules/node-resolver";
import { millisecondsToString } from "../elapsed-time";
import { serviceRunnerServiceSymbol } from "../promises/service-runner-types";
import { devEnv } from "../dev-env";

let _treeKill: typeof import("tree-kill") | undefined;

const { defineProperty } = Reflect;

class ChildProcessError extends Error {}

const { isArray } = Array;

const util_inspect_custom = util.inspect.custom;

export interface SpawnOptions
  extends DevLogTimedOptions,
    ChildProcessWrapper.Options,
    Abortable,
    child_process.SpawnOptions {
  /** The value which will be passed as stdin to the spawned process. Supplying this value will override stdin, stdio[0] */
  input?: string | Buffer | Uint8Array | DataView | undefined;
  debugArguments?: boolean | undefined;
}

export interface NpmSpawnOptions extends SpawnOptions {
  packageManager?: PackageManager;
}

export interface ForkOptions
  extends DevLogTimedOptions,
    ChildProcessWrapper.Options,
    Abortable,
    child_process.ForkOptions {
  /** The value which will be passed as stdin to the spawned process. Supplying this value will override stdin, stdio[0] */
  input?: string | Buffer | Uint8Array | DataView | undefined;
}

export interface SpawnOrForkOptions extends SpawnOptions, ForkOptions {}

export type SpawnArg =
  | string
  | null
  | undefined
  | number
  | false
  | readonly (string | null | undefined | number | false)[];

export namespace ChildProcessWrapper {
  export interface Options extends DevLogTimedOptions {
    /** Initial elapsed time, defaults to 0 */
    elapsed?: number | undefined;

    /**
     * True if the promise will be rejected on AbortError.
     * If false, the promise will just succeed instead.
     * Default is true.
     */
    rejectOnAbort?: boolean | undefined;

    /**
     * True if the promise will be rejected if the statusCode is a non zero number.
     * Default is true.
     */
    rejectOnNonZeroStatusCode?: boolean | undefined;

    /**
     * The signal value to be used when the spawned process will be killed by calling kill without parameters or by the abort signal.
     * @default 'SIGTERM'
     */
    killSignal?: NodeJS.Signals | number | undefined;

    /**
     * If true, process children will be killed as well if an abort signal is received.
     */
    killChildren?: boolean | undefined;

    title?: string | undefined;

    /** If true, stdout and stderr are captured as string */
    captureOutputText?: boolean | "combined" | undefined;

    colorsLevel?: "auto" | 0 | 1 | 2 | 3 | undefined;
  }

  export type ConstructorInput =
    | child_process.ChildProcess
    | Error
    | ((options: ChildProcessWrapper.Options) => {
        childProcess: child_process.ChildProcess;
      });
}

class ErroredChildProcess extends child_process.ChildProcess {
  readonly _error: Error;
  constructor(error?: unknown | undefined) {
    super({ captureRejections: false });
    this._error = devError(error, new.target);
    defineProperty(this, "exitCode", { value: -1, configurable: true });
    defineProperty(this, "killed", { value: true, configurable: true });
  }
}

export class ChildProcessWrapper implements ServicesRunner.Service {
  public static defaultOptions: Omit<ChildProcessWrapper.Options, "title"> = {
    rejectOnAbort: true,
    rejectOnNonZeroStatusCode: true,
    killChildren: false,
    timed: false,
  };

  public static defaultSpawnOptions: Omit<SpawnOrForkOptions, "title"> = {
    timed: true,
  };

  private _childProcess: child_process.ChildProcess;
  private _exitCode: number | NodeJS.Signals | null;
  private _error: Error | null;
  private _terminationPromise: ChildProcessPromise<this>;
  private _promise: ChildProcessPromise<this> | null;
  private _timed: DevLogTimed;
  private _killSignal: NodeJS.Signals | number | undefined;
  private _killChildren: boolean;
  private _pendingPromises: Promise<unknown>[] = [];

  /**
   * If in the option captureOutputText was truthy, and the process has a piped output,
   * this field will contain the process output.
   */
  public stdoutText: string = "";

  /**
   * If in the option captureOutputText was true, and the process has a piped output,
   * this field will contain the process stderr output.
   */
  public stderrText: string = "";

  public constructor(
    input: ChildProcessWrapper.ConstructorInput,
    options?: ChildProcessWrapper.Options | undefined | null,
    abortSignal?: AbortSignal | undefined,
  ) {
    this._error = null;
    this._exitCode = null;
    this._promise = null;

    const defaultOptions = new.target?.defaultOptions ?? ChildProcessWrapper.defaultOptions;
    options = _sanitizeOptions({ ...defaultOptions, ...options }, defaultOptions);

    const captureOutputText = options.captureOutputText || false;

    if (typeof input === "function") {
      try {
        if (abortSignal) {
          abortSignals.throwIfAborted(abortSignal);
        }
        const ret = input(options);
        input = ret.childProcess;
      } catch (error) {
        input = devError(error, new.target);
      }
    }

    const { showStack, rejectOnAbort, rejectOnNonZeroStatusCode, killSignal, killChildren } = options;
    this._killSignal = killSignal;
    this._killChildren = !!killChildren;

    this._timed = new DevLogTimed(`${options.title ?? this.constructor.name}`, options);

    this._timed.start();

    const childProcess =
      typeof input !== "object" || input === null || input instanceof Error ? new ErroredChildProcess(input) : input;
    this._childProcess = childProcess;

    const initialError = new ChildProcessError("Child process error.");
    Error.captureStackTrace(initialError, new.target);

    let exited = false;

    let resolve: (self: this) => void;
    const promise = new ChildProcessPromise<this>((_resolve) => {
      resolve = _resolve;
    });
    promise.childProcessWrapper = this;
    this._terminationPromise = promise;

    const updateErrorProperties = (e: Error): void => {
      const { exitCode, elapsed, title } = this;
      const time = millisecondsToString(elapsed);
      if (e === initialError) {
        if (e === initialError) {
          let msg = title ? `Child process "${title}" failed` : "Child process failed";
          if (exitCode !== null) {
            msg += ` with exitCode:${exitCode}`;
          }
          if (elapsed > 5) {
            msg += ` in ${time}`;
          }
          msg += ".";
          devError.setMessage(e, msg);
        }
      }
      devError.setProperty(e, "process_title", title);
      devError.setProperty(e, "process_time", time);
      devError.setProperty(e, "process_exitCode", exitCode);
    };

    const setError = (e?: Error | undefined): void => {
      if (this._error) {
        return;
      }

      e = devError(e || initialError);
      this._error = e;

      if (showStack !== undefined) {
        devError.setShowStack(e, showStack);
      }

      updateErrorProperties(e);
    };

    let removeAbortRegistration = noop;

    const stdout = childProcess.stdout;
    const stderr = childProcess.stderr;

    const _captureStdout =
      captureOutputText && stdout
        ? (data: string): void => {
            this.stdoutText += data;
          }
        : null;

    const _captureStderr =
      captureOutputText === "combined"
        ? _captureStdout
        : captureOutputText && stderr
        ? (data: string): void => {
            this.stderrText += data;
          }
        : null;

    const onClose = (): void => {
      removeAbortRegistration();

      if (exited) {
        return;
      }

      const pendingPromises = this._pendingPromises;
      if (pendingPromises.length > 0) {
        this._pendingPromises = [];
        void Promise.allSettled(pendingPromises).then(onClose);
        return;
      }

      exited = true;

      try {
        childProcess.removeListener("error", onError);
        childProcess.removeListener("close", onClose);
      } catch {}

      const exitCode = this.exitCode;
      this._exitCode = exitCode;

      if (exitCode && !this._error) {
        setError();
      }

      const error = this._error;
      if (error) {
        updateErrorProperties(error);
        if (error === initialError && !rejectOnNonZeroStatusCode && typeof exitCode === "number") {
          this._timed.end(`exitCode:${exitCode}`);
        } else if (!rejectOnAbort && AbortError.isAbortError(error)) {
          this._timed.fail(error);
          this._timed.status = "succeeded";
        } else {
          this._timed.fail(error);
        }
      } else {
        this._timed.end();
      }

      if (_captureStdout || _captureStderr) {
        setImmediate(() => {
          try {
            if (_captureStdout) {
              stdout!.off("data", _captureStdout);
            }
            if (_captureStderr) {
              stderr!.off("data", _captureStderr);
            }
          } catch {}
          resolve(this);
        });
      } else {
        resolve(this);
      }
    };

    const self = this;

    function onError(e: Error): void {
      removeAbortRegistration();
      if (!exited) {
        setError(e);
        if (!childProcess.pid) {
          onClose();
          return;
        }

        if (AbortError.isAbortError(e) && !self.processTerminated && (killChildren || !self._childProcess.killed)) {
          if (killChildren) {
            self.killChildren();
          }
          self.kill();
        }
      }
    }

    childProcess.once("error", onError);
    childProcess.once("close", onClose);

    if (captureOutputText) {
      if (_captureStdout) {
        stdout!.on("data", _captureStdout);
      }
      if (_captureStderr) {
        stderr!.on("data", _captureStderr);
      }
    }

    if (!exited) {
      if (abortSignal !== undefined) {
        if (abortSignals.isAborted(abortSignal)) {
          onError(new AbortError());
        } else {
          const abort = (): void => {
            onError(new AbortError());
          };
          removeAbortRegistration = abortSignals.addAbortHandler(abortSignal, abort);
        }
      }

      if (this.processTerminated) {
        if (childProcess instanceof ErroredChildProcess) {
          setError(childProcess._error);
          onClose();
        } else {
          setImmediate(onClose);
        }
      }
    }
  }

  public async [serviceRunnerServiceSymbol](): Promise<void> {
    await this.promise();
  }

  public get title(): string {
    return this._timed.title;
  }

  public set title(value: string) {
    this._timed.title = value;
  }

  /**
   * A promise that awaits process termination. It does not reject if there is a process error or a non zero exitCode.
   */
  public terminationPromise(): ChildProcessPromise<this> {
    return this._terminationPromise;
  }

  /**
   * A promise that awaits process termination, and is rejected in case of errors.
   */
  public promise(): ChildProcessPromise<this> {
    let promise = this._promise;
    if (promise === null) {
      const childProcessPromise = (resolve: (self: this) => void, reject: (e: unknown) => void): void => {
        let completed = false;
        const terminated = (instance: this | Error): void => {
          if (!completed) {
            completed = true;
            if (instance instanceof Error || !instance) {
              reject(instance);
            } else {
              const error = instance.error;
              if (error) {
                if (this.isRejected) {
                  reject(error);
                } else {
                  resolve(instance);
                }
              } else {
                resolve(instance);
              }
            }
          }
        };
        this.terminationPromise().then(terminated, terminated);
      };

      promise = new ChildProcessPromise<this>(childProcessPromise);
      promise.childProcessWrapper = this;
      this._promise = promise;
    }
    return promise;
  }

  /** True if the process was terminated. */
  public get processTerminated(): boolean {
    const process = this._childProcess;
    return process.exitCode !== null || process.signalCode !== null || process.pid === undefined;
  }

  /** The child process currently running */
  public get childProcess(): child_process.ChildProcess {
    return this._childProcess;
  }

  /** Promise status. "pending" | "succeeded" | "rejected" */
  public get status(): Deferred.Status {
    return this._timed.status;
  }

  /** If there was an error, this property contains it */
  public get error(): Error | null {
    return this._error;
  }

  /** True if running */
  public get isRunning(): boolean {
    return this._timed.isRunning;
  }

  /** True if completed, with or without errors */
  public get isSettled(): boolean {
    return this._timed.isSettled;
  }

  /** True if completed without errors */
  public get isSucceeded(): boolean {
    return this._timed.isSucceeded;
  }

  /** True if failed */
  public get isRejected(): boolean {
    return this._timed.isRejected;
  }

  /**
   * Returns the process identifier (PID) of the child process. If the child process
   * fails to spawn due to errors, then the value is `undefined` and `error` is
   * emitted.
   */
  public get pid(): number | undefined {
    return this._childProcess.pid;
  }

  /**
   * The `killed` property indicates whether the child process
   * successfully received a signal from `.kill()`.
   * The `killed` property does not indicate that the child process has been terminated.
   */
  public get killed(): boolean {
    return this._childProcess.killed;
  }

  /** Number of milliseconds since the wrapper was created and the process terminated. */
  public get elapsed(): number {
    return this._timed.elapsed;
  }

  public getElapsedTime(): string {
    return this._timed.getElapsedTime();
  }

  public get exitCode(): number | NodeJS.Signals | null {
    const result = this._exitCode;
    if (result !== null) {
      return result;
    }
    if (!this.processTerminated) {
      return null;
    }
    const process = this._childProcess;
    return process.exitCode ?? process.signalCode ?? (this._error || process.pid === undefined ? -1 : 0);
  }

  /**
   * The `subprocess.kill()` method sends a signal to the child process.
   * returns `true` if [`kill(2)`](http://man7.org/linux/man-pages/man2/kill.2.html) succeeds, and `false` otherwise.
   */
  public kill(signal?: NodeJS.Signals | number | undefined, options?: { killChildren?: boolean | undefined }): boolean {
    if (!this.pid) {
      return false;
    }
    const killChildren = options?.killChildren ?? this._killChildren;
    const _signal = signal ?? this._killSignal;
    if (killChildren) {
      this.killChildren(_signal);
    }
    try {
      if (this._childProcess.kill(_signal)) {
        return true;
      }
    } catch {}
    return false;
  }

  public killChildren(signal?: NodeJS.Signals | number | undefined): void {
    this.killChildrenAsync(signal).catch(noop);
  }

  public killChildrenAsync(signal?: NodeJS.Signals | number | undefined): Promise<boolean> {
    const promise = ChildProcessWrapper.killProcessChildren(this, signal ?? this._killSignal ?? "SIGTERM");
    this.addPendingPromise(promise);
    return promise;
  }

  public addPendingPromise(promise: Promise<unknown>): void {
    if (this.isRunning) {
      const myPromise = promise.finally(() => {
        const index = this._pendingPromises.indexOf(myPromise);
        if (index >= 0) {
          this._pendingPromises.splice(index, 1);
        }
      });
      this._pendingPromises.push(myPromise);
    }
  }

  /**
   * Calling `subprocess.ref()` after making a call to `subprocess.unref()` will
   * restore the removed reference count for the child process, forcing the parent
   * to wait for the child to exit before exiting itself.
   *
   * ```js
   * const { spawn } = require('child_process');
   *
   * const subprocess = spawn(process.argv[0], ['child_program.js'], {
   *   detached: true,
   *   stdio: 'ignore'
   * });
   *
   * subprocess.unref();
   * subprocess.ref();
   * ```
   */
  public ref(): void {
    this._childProcess.ref();
  }

  /**
   * By default, the parent will wait for the detached child to exit. To prevent the
   * parent from waiting for a given `subprocess` to exit, use the`subprocess.unref()` method.
   * Doing so will cause the parent's event loop to not include the child in its reference count,
   * allowing the parent to exit independently of the child, unless there is an established IPC channel between
   * the child and the parent.
   *
   * ```js
   * const { spawn } = require('child_process');
   *
   * const subprocess = spawn(process.argv[0], ['child_program.js'], {
   *   detached: true,
   *   stdio: 'ignore'
   * });
   *
   * subprocess.unref();
   * ```
   */
  public unref(): void {
    this._childProcess.unref();
  }

  public toJSON(): {
    class: string;
    title: string;
    exitCode: number | NodeJS.Signals | null;
    time: string;
    error: string | null;
    status: Deferred.Status;
    processTerminated: boolean;
    killed: boolean;
  } {
    return {
      class: this.constructor?.name || ChildProcessWrapper.name,
      title: this.title,
      exitCode: this.exitCode,
      time: this.getElapsedTime(),
      error: this.error ? `${this.error}` : null,
      status: this.status,
      processTerminated: this.processTerminated,
      killed: this._childProcess.killed,
    };
  }

  public [util_inspect_custom](): unknown {
    return this.toJSON();
  }

  public static normalizeArgs(args: readonly SpawnArg[] | null | undefined): string[] {
    if (args === null || args === undefined) {
      return [];
    }
    const result: string[] = [];
    const append = (array: readonly SpawnArg[], level: number): void => {
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

  public static extractSpawnOptions<TOptions extends SpawnOptions | ForkOptions>(
    inputArgs: readonly SpawnArg[] | undefined,
    command: string,
    options: TOptions | null | undefined,
  ): {
    command: string;
    args: string[];
    opts: typeof ChildProcessWrapper.defaultSpawnOptions & TOptions;
    signal: AbortSignal | undefined;
  } {
    const args = ChildProcessWrapper.normalizeArgs(inputArgs);
    const cmd = [command, ...args].join(" ");
    const opts = {
      ...ChildProcessWrapper.defaultSpawnOptions,
      ...options,
    } as typeof ChildProcessWrapper.defaultSpawnOptions & TOptions;

    if (opts.stdio === undefined) {
      if (opts.captureOutputText) {
        opts.stdio = ["inherit", "pipe", "pipe"];
      } else {
        opts.stdio = "inherit";
      }
    }

    if (opts.input === null) {
      opts.input = undefined;
    }

    if (opts.input !== undefined) {
      if (
        typeof opts.stdio === "string" ||
        typeof opts.stdio === "number" ||
        (typeof opts.stdio === "object" && !Array.isArray(opts.stdio))
      ) {
        opts.stdio = [opts.stdio, opts.stdio, opts.stdio];
      }

      if (Array.isArray(opts.stdio)) {
        opts.stdio = [...opts.stdio];
      }

      opts.stdio[0] = "pipe";
    }

    if (typeof opts.title !== "string") {
      opts.title = cmd.length < 40 ? cmd : command;
    }
    if (typeof opts.cwd !== "string") {
      opts.cwd = process.cwd();
    }
    const signal = "signal" in opts ? opts.signal : abortSignals.getSignal(opts.signal);
    opts.signal = undefined;

    if (opts.colorsLevel === "auto") {
      opts.colorsLevel = devEnv.colorsLevel;
    }

    if (opts.captureOutputText && opts.colorsLevel === undefined) {
      opts.colorsLevel = 0;
    }

    if (opts.colorsLevel !== undefined) {
      if (opts.colorsLevel === 0) {
        opts.env = { ...(opts.env || process.env), NO_COLOR: "true", COLOR: "0", FORCE_COLOR: "0" };
      } else if (opts.colorsLevel > 0) {
        opts.env = { ...(opts.env || process.env), COLOR: "1", FORCE_COLOR: opts.colorsLevel.toString() };
        delete opts.env.NO_COLOR;
      }
    }
    return { command, args, opts, signal };
  }

  /** Spawn a new process, redirect stdio and await for completion. */
  public static spawn(
    command: string,
    inputArgs?: readonly SpawnArg[] | undefined,
    options?: SpawnOptions | null | undefined,
  ): ChildProcessWrapper {
    const { args, opts, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, command, options);
    if (opts.debugArguments) {
      devLog.debug(`spawn: ${command} `, args);
    }
    return new ChildProcessWrapper(
      () => {
        const childProcess = child_process.spawn(command, args, opts);
        if (opts.input !== undefined) {
          childProcess.stdin?.write(opts.input);
          opts.input = undefined;
        }
        return { childProcess };
      },
      opts,
      signal,
    );
  }

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  public static fork(
    moduleId: string,
    inputArgs?: readonly SpawnArg[] | undefined,
    options?: ForkOptions | null,
  ): ChildProcessWrapper {
    const { opts, args, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, moduleId, options);
    return new ChildProcessWrapper(
      () => {
        const childProcess = child_process.fork(moduleId, args, opts);
        if (opts.input !== undefined) {
          childProcess.stdin?.write(opts.input, noop);
          opts.input = undefined;
        }
        return { childProcess };
      },
      opts,
      signal,
    );
  }

  /** Forks the node process that runs the given bin command for the given package, redirect stdio and await for completion. */
  public static runModuleBin(
    moduleId: string,
    executableId: string,
    inputArgs: readonly SpawnArg[] = [],
    options?: ForkOptions | undefined,
  ): ChildProcessWrapper {
    options = { ...options };
    if (typeof options.title !== "string") {
      options = {
        ...options,
        title: moduleId !== executableId ? `${moduleId}:${executableId}` : moduleId,
      };
    }
    const { opts, args, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, moduleId, options);

    return new ChildProcessWrapper(
      () => {
        const resolved = NodeResolver.workspaceRoot.resolvePackageBin(moduleId, executableId, opts.cwd);
        if (!resolved) {
          throw new Error(`runModuleBin: Could not find ${moduleId}:${executableId}`);
        }
        const childProcess = child_process.fork(resolved, args, opts);
        if (opts.input !== undefined) {
          childProcess.stdin?.write(opts.input, noop);
          opts.input = undefined;
        }
        return { childProcess };
      },
      opts,
      signal,
    );
  }

  /** Executes npm run <command> [args] */
  public static npmRun(
    command: string,
    args: readonly SpawnArg[] = [],
    options?: NpmSpawnOptions | undefined,
  ): ChildProcessWrapper {
    const packageManager = (options && options.packageManager) || NodeResolver.workspaceRoot.packageManager;
    options = {
      title: `${packageManager} run ${command}`,
      ...options,
      packageManager,
    };
    return ChildProcessWrapper.npmCommand("run", [command, ...args], options);
  }

  /** Executes npm <command> [args] */
  public static npmCommand(
    command: string,
    args: readonly SpawnArg[] = [],
    options?: NpmSpawnOptions | undefined,
  ): ChildProcessWrapper {
    const packageManager = (options && options.packageManager) || NodeResolver.workspaceRoot.packageManager;
    options = {
      title: `${packageManager} ${command}`,
      ...options,
      packageManager,
    };
    return ChildProcessWrapper.npm([command, ...args], options);
  }

  /** Executes npm [args] */
  public static npm(args: readonly SpawnArg[] = [], options?: NpmSpawnOptions | undefined): ChildProcessWrapper {
    const packageManager = (options && options.packageManager) || NodeResolver.workspaceRoot.packageManager;
    options = { title: packageManager, ...options, packageManager };
    return ChildProcessWrapper.spawn(packageManager + (process.platform === "win32" ? ".cmd" : ""), args, options);
  }

  /** Kills all child processes of the given process id or ChildProcess instance. */
  public static killProcessChildren(
    pid: number | child_process.ChildProcess | { pid: number | undefined } | null | undefined,
    signal?: NodeJS.Signals | number | undefined,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      if (!pid) {
        return resolve(false);
      }
      if (typeof pid === "object" && pid !== null) {
        pid = pid.pid;
        if (!pid) {
          return resolve(false);
        }
      }
      if (!_treeKill) {
        _treeKill = require("tree-kill");
      }
      return _treeKill!(pid, signal, (error: unknown) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }
}

const private_childProcessWrapper = Symbol.for("childProcessWrapper");
const private_error = Symbol.for("error");

export class ChildProcessPromise<T = ChildProcessWrapper>
  extends Promise<T>
  implements InterfaceFromClass<ChildProcessWrapper>
{
  private [private_childProcessWrapper]: ChildProcessWrapper | undefined;
  private [private_error]?: Error | undefined;

  public constructor(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown | undefined) => void) => void,
  ) {
    let wrapper: ChildProcessWrapper | undefined;
    let error: Error | undefined;
    super((resolve, reject) => {
      executor(
        (value) => {
          if (value instanceof ChildProcessWrapper) {
            wrapper = value;
          }
          if (value instanceof ChildProcessPromise) {
            wrapper = value.childProcessWrapper;
          }
          resolve(value);
        },
        (e) => {
          error = devError(e);
          reject(e);
        },
      );
    });
    if (wrapper !== undefined) {
      this[private_childProcessWrapper] = wrapper;
    } else if (error !== undefined) {
      this[private_error] = error;
    }
  }

  /**
   * If in the option captureOutputText was truthy, and the process has a piped output,
   * this field will contain the process output.
   */
  public get stdoutText(): string {
    return this.childProcessWrapper.stdoutText;
  }

  public set stdoutText(value: string) {
    this.childProcessWrapper.stdoutText = value;
  }

  /**
   * If in the option captureOutputText was true, and the process has a piped output,
   * this field will contain the process stderr output.
   */
  public get stderrText(): string {
    return this.childProcessWrapper.stderrText;
  }

  public set stderrText(value: string) {
    this.childProcessWrapper.stderrText = value;
  }

  public [util_inspect_custom](): unknown {
    return this.toJSON();
  }

  public addPendingPromise(promise: Promise<unknown>): void {
    this.childProcessWrapper.addPendingPromise(promise);
  }

  public get pid(): number | undefined {
    return this.childProcessWrapper.pid;
  }

  public get childProcessWrapper(): ChildProcessWrapper {
    let result = this[private_childProcessWrapper];
    if (!result) {
      result = new ChildProcessWrapper(devError(this[private_error]), {
        timed: false,
        showStack: false,
        printStarted: false,
        logError: false,
      });
    }
    return result;
  }

  public set childProcessWrapper(value: ChildProcessWrapper) {
    this[private_childProcessWrapper] = value;
  }

  public get title(): string {
    return this.childProcessWrapper.title;
  }

  public set title(value: string) {
    this.childProcessWrapper.title = value;
  }

  public promise(): ChildProcessPromise<ChildProcessWrapper> {
    return this.childProcessWrapper.promise();
  }

  public terminationPromise(): ChildProcessPromise<ChildProcessWrapper> {
    return this.childProcessWrapper.terminationPromise();
  }

  public getElapsedTime(): string {
    return this.childProcessWrapper.getElapsedTime();
  }

  public get processTerminated(): boolean {
    return this.childProcessWrapper.processTerminated;
  }

  public get childProcess(): child_process.ChildProcess {
    return this.childProcessWrapper.childProcess;
  }

  public get status(): Deferred.Status {
    return this.childProcessWrapper.status;
  }

  public get error(): Error | null {
    return this.childProcessWrapper.error;
  }

  public get isRunning(): boolean {
    return this.childProcessWrapper.isRunning;
  }

  public get isSettled(): boolean {
    return this.childProcessWrapper.isSettled;
  }

  public get isSucceeded(): boolean {
    return this.childProcessWrapper.isSucceeded;
  }

  public get isRejected(): boolean {
    return this.childProcessWrapper.isRejected;
  }

  public get killed(): boolean {
    return this.childProcessWrapper.killed;
  }

  public get elapsed(): number {
    return this.childProcessWrapper.elapsed;
  }

  public get exitCode(): number | NodeJS.Signals | null {
    return this.childProcessWrapper.exitCode;
  }

  public kill(signal?: number | NodeJS.Signals | undefined, options?: { killChildren?: boolean | undefined }): boolean {
    return this.childProcessWrapper.kill(signal, options);
  }

  public killChildren(signal?: number | NodeJS.Signals | undefined): void {
    return this.childProcessWrapper.killChildren(signal);
  }

  public killChildrenAsync(signal?: number | NodeJS.Signals | undefined): Promise<boolean> {
    return this.childProcessWrapper.killChildrenAsync(signal);
  }

  public ref(): void {
    return this.childProcessWrapper.ref();
  }

  public unref(): void {
    return this.childProcessWrapper.unref();
  }

  public toJSON(): {
    class: string;
    title: string;
    exitCode: number | NodeJS.Signals | null;
    time: string;
    error: string | null;
    status: Deferred.Status;
    processTerminated: boolean;
    killed: boolean;
  } {
    return {
      ...this.childProcessWrapper.toJSON(),
      class: this.constructor?.name || ChildProcessPromise.name,
    };
  }

  public override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: UnsafeAny) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): ChildProcessPromise<TResult1 | TResult2> {
    const result = super.then(onfulfilled, onrejected) as ChildProcessPromise<TResult1 | TResult2>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  public override catch<TResult = never>(
    onrejected?: ((reason: UnsafeAny) => TResult | PromiseLike<TResult>) | undefined | null,
  ): ChildProcessPromise<T | TResult> {
    const result = super.catch(onrejected) as ChildProcessPromise<T | TResult>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  public override finally(onfinally?: (() => void) | null | undefined): ChildProcessPromise<T> {
    const result = super.finally(onfinally) as ChildProcessPromise<T>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  /** Calls a function passing this instance as argument. */
  public with(fn: (self: this) => void): this {
    fn(this);
    return this;
  }

  /**
   * Creates a new rejected promise for the provided reason.
   * @param reason The reason the promise was rejected.
   * @returns A new rejected Promise.
   */
  public static override reject<T = never>(reason?: Error | undefined): ChildProcessPromise<T> {
    const result = new ChildProcessPromise<T>((_, reject) => {
      reject(reason);
    });
    if (reason instanceof ChildProcessPromise) {
      result.childProcessWrapper = reason.childProcessWrapper;
    }
    return result;
  }

  public async [serviceRunnerServiceSymbol](): Promise<void> {
    await (this as Promise<T>);
  }
}

function _sanitizeOptions(
  options: ChildProcessWrapper.Options,
  defaultOptions: Omit<ChildProcessWrapper.Options, "title" | "caller">,
): ChildProcessWrapper.Options {
  if (options.showStack === undefined && defaultOptions.showStack !== undefined) {
    options.showStack = defaultOptions.showStack;
  }
  if (options.rejectOnAbort === undefined) {
    options.rejectOnAbort = defaultOptions.rejectOnAbort ?? true;
  }
  if (options.rejectOnNonZeroStatusCode === undefined) {
    options.rejectOnAbort = defaultOptions.rejectOnNonZeroStatusCode ?? true;
  }
  if (!options.killSignal && defaultOptions.killSignal !== undefined) {
    options.killSignal = defaultOptions.killSignal;
  }
  if (options.killChildren === undefined && defaultOptions.killChildren !== undefined) {
    options.killChildren = defaultOptions.killChildren;
  }
  return options;
}
