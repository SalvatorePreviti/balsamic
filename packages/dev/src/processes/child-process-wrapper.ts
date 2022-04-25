import util from "util";
import { ChildProcess } from "child_process";
import { devError } from "../dev-error";
import { millisecondsToString } from "../utils";
import { InterfaceFromClass } from "../types";
import { Deferred, noop } from "../promises/promises";
import { DevLogTimed, DevLogTimeOptions } from "../dev-log";
import { AbortError } from "../promises/abort-error";
import { abortSignals } from "../promises/abort-signals";
import { killProcessChildren } from "./lib/kill-process-children";

const { defineProperty } = Reflect;

class ChildProcessError extends Error {}

export namespace ChildProcessWrapper {
  export interface Options extends DevLogTimeOptions {
    /** Initial elapsed time, defaults to 0 */
    elapsed?: number;

    /** Number of milliseconds to wait between error or abort and process exit. */
    exitErrorTimeout?: number;

    /**
     * True if the promise will be rejected on AbortError.
     * If false, the promise will just succeed instead.
     * Default is true.
     */
    rejectOnAbort?: boolean;

    /**
     * True if the promise will be rejected if the statusCode is a non zero number.
     * Default is true.
     */
    rejectOnNonZeroStatusCode?: boolean;

    /**
     * The signal value to be used when the spawned process will be killed by calling kill without parameters or by the abort signal.
     * @default 'SIGTERM'
     */
    killSignal?: NodeJS.Signals | number | undefined;

    /**
     * If true, process children will be killed as well if an abort signal is received.
     */
    killChildren?: boolean;

    title?: string;
  }

  export type ConstructorInput =
    | ChildProcess
    | Error
    | ((options: ChildProcessWrapper.Options) => {
        childProcess: ChildProcess;
        options?: ChildProcessWrapper.Options;
        abortSignal?: AbortSignal | null;
      });
}

class ErroredChildProcess extends ChildProcess {
  readonly _error: Error;
  constructor(error?: unknown) {
    super({ captureRejections: false });
    this._error = devError(error, new.target);
    defineProperty(this, "exitCode", { value: -1, configurable: true });
    defineProperty(this, "killed", { value: true, configurable: true });
  }
}

export class ChildProcessWrapper {
  public static defaultOptions: Omit<ChildProcessWrapper.Options, "title"> = {
    exitErrorTimeout: 6000,
    rejectOnAbort: true,
    rejectOnNonZeroStatusCode: true,
    killChildren: false,
    timed: false,
  };

  #childProcess: ChildProcess;
  #exitCode: number | NodeJS.Signals | null;
  #error: Error | null;
  #terminationPromise: ChildProcessPromise<this>;
  #promise: ChildProcessPromise<this> | null;
  #unreffed: boolean = false;
  #timed: DevLogTimed;
  #killSignal: NodeJS.Signals | number | undefined;
  #killChildren: boolean;

  public constructor(
    input: ChildProcessWrapper.ConstructorInput,
    options?: ChildProcessWrapper.Options | null,
    abortSignal?: AbortSignal,
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
        if (ret.abortSignal !== undefined) {
          abortSignal = ret.abortSignal ?? undefined;
        }
        if (ret.options) {
          const newOptions = { ...options, ...ret.options };
          options = _sanitizeOptions(newOptions, options);
        }
      } catch (error) {
        input = devError(error, new.target);
      }
    }

    const { showStack, exitErrorTimeout, rejectOnAbort, rejectOnNonZeroStatusCode, killSignal, killChildren } = options;
    this.#killSignal = killSignal;
    this.#killChildren = !!killChildren;

    this.#timed = new DevLogTimed(`${options.title ?? this.constructor.name}`, options);

    this.#timed.start();

    this.#childProcess =
      typeof input !== "object" || input === null || input instanceof Error ? new ErroredChildProcess(input) : input;

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

    const setError = (e?: Error) => {
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

    let waitTerminationCount = 0;
    let waitTerminationTimer: ReturnType<typeof setTimeout> | null = null;

    const onExit = () => {
      if (waitTerminationTimer) {
        clearTimeout(waitTerminationTimer);
        waitTerminationTimer = null;
      }

      if (exited) {
        return;
      }
      exited = true;

      try {
        this.#childProcess.removeListener("error", onError);
        this.#childProcess.removeListener("exit", onExit);
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

    const waitTermination = () => {
      const maxTimeout = this.#unreffed ? 10 : exitErrorTimeout;
      if (this.processTerminated || this.#unreffed || performance.now() - this.#timed.starTime >= maxTimeout!) {
        onExit();
        return;
      }

      if (waitTerminationTimer) {
        clearTimeout(waitTerminationTimer);
      }
      waitTerminationTimer = setTimeout(
        waitTermination,
        Math.max(maxTimeout!, Math.min(waitTerminationCount++ * 25, 500)),
      );
    };

    const self = this;

    function onError(e: Error) {
      if (!exited) {
        setError(e);
        if (AbortError.isAbortError(e) && !self.processTerminated && (killChildren || !self.#childProcess.killed)) {
          self.kill();
        }
        waitTermination();
      }
    }

    this.#childProcess.once("error", onError);
    this.#childProcess.once("exit", onExit);

    if (!exited) {
      if (this.processTerminated) {
        if (this.#childProcess instanceof ErroredChildProcess) {
          setError(this.#childProcess._error);
          onExit();
        } else {
          setImmediate(onExit);
        }
      } else if (abortSignal !== undefined) {
        if (abortSignals.isAborted(abortSignal)) {
          abortSignals.rejectIfAborted(abortSignal).catch(onError);
        } else {
          abortSignals.addAbortHandler(abortSignal, () => {
            abortSignals.rejectIfAborted(abortSignal).catch(onError);
          });
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
  public get childProcess(): ChildProcess {
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
  public kill(signal?: NodeJS.Signals | number | undefined, options?: { killChildren?: boolean }): boolean {
    if (this.processTerminated) {
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
    return killProcessChildren(this, signal ?? this.#killSignal);
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
    this.#unreffed = false;
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
    this.#unreffed = true;
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

  public [util.inspect.custom]() {
    return this.toJSON();
  }
}

export class ChildProcessPromise<T = ChildProcessWrapper>
  extends Promise<T>
  implements InterfaceFromClass<ChildProcessWrapper>
{
  #childProcessWrapper: ChildProcessWrapper | undefined;
  #error?: Error;

  public constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
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

  public [util.inspect.custom]() {
    return this.childProcessWrapper?.[util.inspect.custom]?.() || this.constructor.name;
  }

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
        exitErrorTimeout: 0,
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

  public get childProcess(): ChildProcess {
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

  public kill(signal?: number | NodeJS.Signals, options?: { killChildren?: boolean }): boolean {
    return this.childProcessWrapper.kill(signal, options);
  }

  public killChildren(signal?: number | NodeJS.Signals): void {
    return this.childProcessWrapper.killChildren(signal);
  }

  public killChildrenAsync(signal?: number | NodeJS.Signals): Promise<boolean> {
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

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): ChildProcessPromise<TResult1 | TResult2> {
    const result = super.then(onfulfilled, onrejected) as ChildProcessPromise<TResult1 | TResult2>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): ChildProcessPromise<T | TResult> {
    const result = super.catch(onrejected) as ChildProcessPromise<T | TResult>;
    result.childProcessWrapper = this.childProcessWrapper;
    return result;
  }

  public finally(onfinally?: (() => void) | null): ChildProcessPromise<T> {
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
  public static reject<T = never>(reason?: any): ChildProcessPromise<T> {
    const result = new ChildProcessPromise<T>((_, reject) => {
      reject(reason);
    });
    if (reason instanceof ChildProcessPromise) {
      result.childProcessWrapper = reason.childProcessWrapper;
    }
    return result;
  }
}

function _sanitizeOptions(
  options: ChildProcessWrapper.Options,
  defaultOptions: Omit<ChildProcessWrapper.Options, "title" | "caller">,
) {
  if (options.showStack === undefined) {
    options.showStack = defaultOptions.showStack;
  }
  if (options.exitErrorTimeout === undefined) {
    options.exitErrorTimeout = defaultOptions.exitErrorTimeout ?? 5000;
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
