import util from "util";
import child_process from "child_process";
import { devError } from "../dev-error";
import { millisecondsToString, noop } from "../utils";
import type { InterfaceFromClass } from "../types";
import { DevLogTimed, DevLogTimeOptions } from "../dev-log";
import { AbortError } from "../promises/abort-error";
import { abortSignals } from "../promises/abort-signals";
import { killProcessChildren } from "./lib/kill-process-children";
import type { Deferred } from "../promises/deferred";
import type { Abortable } from "events";
import { NodeResolver } from "../modules/node-resolver";
import { ServicesRunner } from "../promises/services-runner";

const { defineProperty } = Reflect;

class ChildProcessError extends Error {}

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

export namespace ChildProcessWrapper {
  export interface Options extends DevLogTimeOptions {
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
    stdio: "inherit",
    env: process.env,
    throwOnExitCode: true,
    timed: true,
  };

  #childProcess: child_process.ChildProcess;
  #exitCode: number | NodeJS.Signals | null;
  #error: Error | null;
  #terminationPromise: ChildProcessPromise<this>;
  #promise: ChildProcessPromise<this> | null;
  #timed: DevLogTimed;
  #killSignal: NodeJS.Signals | number | undefined;
  #killChildren: boolean;
  #pendingPromises: Promise<unknown>[] = [];

  public constructor(
    input: ChildProcessWrapper.ConstructorInput,
    options?: ChildProcessWrapper.Options | undefined | null,
    abortSignal?: AbortSignal | undefined,
  ) {
    this.#error = null;
    this.#exitCode = null;
    this.#promise = null;

    const defaultOptions = new.target?.defaultOptions ?? ChildProcessWrapper.defaultOptions;
    options = { ...defaultOptions, ...options };
    options = _sanitizeOptions(options, defaultOptions);

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
    this.#killSignal = killSignal;
    this.#killChildren = !!killChildren;

    this.#timed = new DevLogTimed(`${options.title ?? this.constructor.name}`, options);

    this.#timed.start();

    const childProcess =
      typeof input !== "object" || input === null || input instanceof Error ? new ErroredChildProcess(input) : input;
    this.#childProcess = childProcess;

    const initialError = new ChildProcessError("Child process error.");
    Error.captureStackTrace(initialError, new.target);

    let exited = false;

    let resolve: (self: this) => void;
    const promise = new ChildProcessPromise<this>((_resolve) => {
      resolve = _resolve;
    });
    promise.childProcessWrapper = this;
    this.#terminationPromise = promise;

    const updateErrorProperties = (e: Error) => {
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

    const setError = (e?: Error | undefined) => {
      if (this.#error) {
        return;
      }

      e = devError(e || initialError);
      this.#error = e;

      if (showStack !== undefined) {
        devError.setShowStack(e, showStack);
      }

      updateErrorProperties(e);
    };

    let removeAbortRegistration = noop;

    const onClose = () => {
      removeAbortRegistration();

      if (exited) {
        return;
      }

      const pendingPromises = this.#pendingPromises;
      if (pendingPromises.length > 0) {
        this.#pendingPromises = [];
        Promise.allSettled(pendingPromises).then(onClose);
        return;
      }

      exited = true;

      try {
        childProcess.removeListener("error", onError);
        childProcess.removeListener("close", onClose);
      } catch {}

      const exitCode = this.exitCode;
      this.#exitCode = exitCode;

      if (exitCode && !this.#error) {
        setError();
      }

      const error = this.#error;
      if (error) {
        updateErrorProperties(error);
        if (error === initialError && !rejectOnNonZeroStatusCode && typeof exitCode === "number") {
          this.#timed.end(`exitCode:${exitCode}`);
        } else if (!rejectOnAbort && AbortError.isAbortError(error)) {
          this.#timed.fail(error);
          this.#timed.status = "succeeded";
        } else {
          this.#timed.fail(error);
        }
      } else {
        this.#timed.end();
      }

      resolve(this);
    };

    const self = this;

    function onError(e: Error) {
      removeAbortRegistration();
      if (!exited) {
        setError(e);
        if (!childProcess.pid) {
          onClose();
          return;
        }

        if (AbortError.isAbortError(e) && !self.processTerminated && (killChildren || !self.#childProcess.killed)) {
          if (killChildren) {
            self.killChildren();
          }
          self.kill();
        }
      }
    }

    childProcess.once("error", onError);
    childProcess.once("close", onClose);

    if (!exited) {
      if (abortSignal !== undefined) {
        if (abortSignals.isAborted(abortSignal)) {
          onError(new AbortError());
        } else {
          const abort = () => {
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

  public get title(): string {
    return this.#timed.title;
  }

  public set title(value: string) {
    this.#timed.title = value;
  }

  /**
   * A promise that awaits process termination. It does not reject if there is a process error or a non zero exitcode.
   */
  public terminationPromise(): ChildProcessPromise<this> {
    return this.#terminationPromise;
  }

  /**
   * A promise that awaits process termination, and is rejected in case of errors.
   */
  public promise(): ChildProcessPromise<this> {
    let promise = this.#promise;
    if (promise === null) {
      promise = new ChildProcessPromise<this>((resolve, reject) => {
        let completed = false;
        const terminated = (instance: this | Error) => {
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
        return this.terminationPromise().then(terminated, terminated);
      });
      promise.childProcessWrapper = this;
      this.#promise = promise;
    }
    return promise;
  }

  /** True if the process was terminated. */
  public get processTerminated(): boolean {
    const process = this.#childProcess;
    return process.exitCode !== null || process.signalCode !== null || process.pid === undefined;
  }

  /** The child process currently running */
  public get childProcess(): child_process.ChildProcess {
    return this.#childProcess;
  }

  /** Promise status. "pending" | "succeeded" | "rejected" */
  public get status(): Deferred.Status {
    return this.#timed.status;
  }

  /** If there was an error, this property contains it */
  public get error(): Error | null {
    return this.#error;
  }

  /** True if running */
  public get isRunning() {
    return this.#timed.isRunning;
  }

  /** True if completed, with or without errors */
  public get isSettled() {
    return this.#timed.isSettled;
  }

  /** True if completed without errors */
  public get isSucceeded() {
    return this.#timed.isSucceeded;
  }

  /** True if failed */
  public get isRejected() {
    return this.#timed.isRejected;
  }

  /**
   * Returns the process identifier (PID) of the child process. If the child process
   * fails to spawn due to errors, then the value is `undefined` and `error` is
   * emitted.
   */
  public get pid(): number | undefined {
    return this.#childProcess.pid;
  }

  /**
   * The `killed` property indicates whether the child process
   * successfully received a signal from `.kill()`.
   * The `killed` property does not indicate that the child process has been terminated.
   */
  public get killed(): boolean {
    return this.#childProcess.killed;
  }

  /** Number of milliseconds since the wrapper was created and the process terminated. */
  public get elapsed(): number {
    return this.#timed.elapsed;
  }

  public getElapsedTime(): string {
    return this.#timed.getElapsedTime();
  }

  public get exitCode(): number | NodeJS.Signals | null {
    const result = this.#exitCode;
    if (result !== null) {
      return result;
    }
    if (!this.processTerminated) {
      return null;
    }
    const process = this.#childProcess;
    return process.exitCode ?? process.signalCode ?? (this.#error || process.pid === undefined ? -1 : 0);
  }

  /**
   * The `subprocess.kill()` method sends a signal to the child process.
   * returns `true` if [`kill(2)`](http://man7.org/linux/man-pages/man2/kill.2.html) succeeds, and `false` otherwise.
   */
  public kill(signal?: NodeJS.Signals | number | undefined, options?: { killChildren?: boolean | undefined }): boolean {
    if (!this.pid) {
      return false;
    }
    const killChildren = options?.killChildren ?? this.#killChildren;
    const _signal = signal ?? this.#killSignal;
    if (killChildren) {
      this.killChildren(_signal);
    }
    try {
      if (this.#childProcess.kill(_signal)) {
        return true;
      }
    } catch {}
    return false;
  }

  public killChildren(signal?: NodeJS.Signals | number | undefined): void {
    this.killChildrenAsync(signal).catch(noop);
  }

  public killChildrenAsync(signal?: NodeJS.Signals | number | undefined): Promise<boolean> {
    const promise = killProcessChildren(this, signal ?? this.#killSignal ?? "SIGTERM");
    this.addPendingPromise(promise);
    return promise;
  }

  public addPendingPromise(promise: Promise<unknown>): void {
    if (this.isRunning) {
      promise.finally(() => {
        const index = this.#pendingPromises.indexOf(promise);
        if (index >= 0) {
          this.#pendingPromises.splice(index, 1);
        }
      });
      this.#pendingPromises.push(promise);
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
    this.#childProcess.ref();
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
    this.#childProcess.unref();
  }

  public toJSON() {
    return {
      class: this.constructor?.name || ChildProcessWrapper.name,
      title: this.title,
      exitCode: this.exitCode,
      time: this.getElapsedTime(),
      error: this.error ? `${this.error}` : null,
      status: this.status,
      processTerminated: this.processTerminated,
      killed: this.#childProcess.killed,
    };
  }

  public [util.inspect.custom](): unknown {
    return this.toJSON();
  }

  public static normalizeArgs(args: readonly SpawnArg[] | null | undefined): string[] {
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

  public static extractSpawnOptions<TOptions extends SpawnOptions | ForkOptions>(
    inputArgs: readonly SpawnArg[] | undefined,
    command: string,
    options: TOptions | null | undefined,
  ) {
    const args = ChildProcessWrapper.normalizeArgs(inputArgs);
    const cmd = [command, ...args].join(" ");
    const opts = { ...ChildProcessWrapper.defaultSpawnOptions, ...options };
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
  public static spawn(
    command: string,
    inputArgs?: readonly SpawnArg[] | undefined,
    options?: SpawnOptions | null | undefined,
  ) {
    const { args, opts, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, command, options);
    return new ChildProcessWrapper(
      () => {
        return { childProcess: child_process.spawn(command, args, opts) };
      },
      opts,
      signal,
    );
  }

  /** Forks the node process that runs the given module, redirect stdio and await for completion. */
  public static fork(moduleId: string, inputArgs?: readonly SpawnArg[] | undefined, options?: ForkOptions | null) {
    const { opts, args, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, moduleId, options);
    return new ChildProcessWrapper(
      () => {
        return { childProcess: child_process.fork(moduleId, args, opts) };
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
  ) {
    options = { ...options };
    if (typeof options.title !== "string") {
      options = { ...options, title: moduleId !== executableId ? `${moduleId}:${executableId}` : moduleId };
    }
    const { opts, args, signal } = ChildProcessWrapper.extractSpawnOptions(inputArgs, moduleId, options);

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
  public static npmRun(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions | undefined) {
    options = { title: `npm run ${command}`, ...options };
    return ChildProcessWrapper.spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", command, ...args],
      options,
    );
  }

  /** Executes npm <command> [args] */
  public static npmCommand(command: string, args: readonly SpawnArg[] = [], options?: SpawnOptions | undefined) {
    options = { title: `npm ${command}`, ...options };
    return ChildProcessWrapper.spawn(process.platform === "win32" ? "npm.cmd" : "npm", [command, ...args], options);
  }

  public async [ServicesRunner.serviceRunnerServiceSymbol]() {
    await this.promise();
  }
}

export class ChildProcessPromise<T = ChildProcessWrapper>
  extends Promise<T>
  implements InterfaceFromClass<ChildProcessWrapper>
{
  #childProcessWrapper: ChildProcessWrapper | undefined;
  #error?: Error | undefined;

  public constructor(
    executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any | undefined) => void) => void,
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
          error = e;
          reject(e);
        },
      );
    });
    if (wrapper !== undefined) {
      this.#childProcessWrapper = wrapper;
    } else if (error !== undefined) {
      this.#error = error;
    }
  }

  public [util.inspect.custom](): unknown {
    return this.toJSON();
  }

  public addPendingPromise(promise: Promise<unknown>): void {
    this.childProcessWrapper.addPendingPromise(promise);
  }

  self: ChildProcessWrapper;

  public get pid(): number | undefined {
    return this.childProcessWrapper.pid;
  }

  public get childProcessWrapper(): ChildProcessWrapper {
    let result = this.#childProcessWrapper;
    if (!result) {
      result = new ChildProcessWrapper(devError(this.#error), {
        timed: false,
        showStack: false,
        printStarted: false,
        logError: false,
      });
    }
    return result;
  }

  public set childProcessWrapper(value: ChildProcessWrapper) {
    this.#childProcessWrapper = value;
  }

  public get title(): string {
    return this.childProcessWrapper.title;
  }

  public set title(value: string) {
    this.childProcessWrapper.title = value;
  }

  public promise() {
    return this.childProcessWrapper.promise();
  }

  public terminationPromise() {
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

  public toJSON() {
    return {
      ...this.childProcessWrapper.toJSON(),
      class: this.constructor?.name || ChildProcessPromise.name,
    };
  }

  public override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): ChildProcessPromise<TResult1 | TResult2> {
    const result = super.then(onfulfilled, onrejected) as ChildProcessPromise<TResult1 | TResult2>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  public override catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined,
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
  public static override reject<T = never>(reason?: any | undefined): ChildProcessPromise<T> {
    const result = new ChildProcessPromise<T>((_, reject) => {
      reject(reason);
    });
    if (reason instanceof ChildProcessPromise) {
      result.childProcessWrapper = reason.childProcessWrapper;
    }
    return result;
  }

  public async [ServicesRunner.serviceRunnerServiceSymbol]() {
    await this;
  }
}

function _sanitizeOptions(
  options: ChildProcessWrapper.Options,
  defaultOptions: Omit<ChildProcessWrapper.Options, "title" | "caller">,
) {
  if (options.showStack === undefined) {
    options.showStack = defaultOptions.showStack;
  }
  if (options.rejectOnAbort === undefined) {
    options.rejectOnAbort = defaultOptions.rejectOnAbort ?? true;
  }
  if (options.rejectOnNonZeroStatusCode === undefined) {
    options.rejectOnAbort = defaultOptions.rejectOnNonZeroStatusCode ?? true;
  }
  if (!options.killSignal) {
    options.killSignal = defaultOptions.killSignal;
  }
  if (options.killChildren === undefined) {
    options.killChildren = defaultOptions.killChildren;
  }
  return options;
}
