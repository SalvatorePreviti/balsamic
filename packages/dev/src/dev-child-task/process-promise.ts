import { ChildProcess } from "child_process";
import { devError } from "../dev-error";
import { AbortError, Deferred } from "../lib/promises";
import { DevLogTimed, DevLogTimeOptions } from "../dev-log";
import type { Abortable } from "node:events";

export class ProcessPromiseResult {
  exitCode: number | NodeJS.Signals;
}

interface ProcessPromiseState {
  title: string;
  child: ChildProcess | null;
  status: Deferred.Status;
  exitCode: number | NodeJS.Signals | null;
  error: Error | null;
}

export namespace ProcessPromise {
  export interface Options extends DevLogTimeOptions, Abortable {
    title?: string;

    /** Overrides the showStack property in case of error */
    showStack?: boolean;

    /** Throws if exitCode is non zero or a signal was raised. Default is true. */
    throwOnExitCode?: boolean;

    /** Amount of milliseconds to wait after an error (for example abort) for the process to terminate before rejecting the promise. Default is 5000 */
    errorTimeoutBeforeExit?: number;

    /** True if the promise will be rejected on abort. If false, the promise will just succeed instead. Default is true. */
    rejectOnAbort?: boolean;
  }
}

export class ProcessPromise extends Promise<ProcessPromiseResult> {
  #state: ProcessPromiseState;

  public static rejectProcessPromise(reason: unknown, options: ProcessPromise.Options = {}): ProcessPromise {
    return new ProcessPromise(devError(reason, ProcessPromise.rejectProcessPromise), options);
  }

  public constructor(childProcess: ChildProcess | (() => ChildProcess) | Error, options: ProcessPromise.Options = {}) {
    const title = options.title || "";

    let exitError = new Error(title ? `Child process "${title}" failed` : "Child process failed");
    Error.captureStackTrace(exitError, new.target);
    if (options.showStack !== undefined) {
      devError.setShowStack(exitError, options.showStack);
    }

    const timed = new DevLogTimed(title || "child process", options);

    const state: ProcessPromiseState = {
      title,
      child: null,
      status: "pending",
      exitCode: null,
      error: null,
    };

    const runProcessPromise = (resolve: (value: ProcessPromiseResult) => void, reject: (e: Error) => void) => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let errored = false;

      const doReject = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (state.status === "pending") {
          const { rejectOnAbort } = options;
          if (rejectOnAbort !== undefined && !rejectOnAbort && AbortError.isAbortError(exitError)) {
            state.status = "succeeded";
            timed.end();
            resolve({ exitCode: "SIGABRT" });
          } else {
            timed.fail(exitError);
            state.status = "rejected";
            reject(exitError);
          }
        }
      };

      const setError = (error: any, delayed: boolean) => {
        if (errored) {
          return false;
        }
        errored = true;
        exitError = devError(error || exitError, setError);
        if (state.title) {
          devError.setProperty(exitError, "title", state.title, true);
        }
        state.error = exitError;

        if (delayed) {
          timeout = setTimeout(doReject, options.errorTimeoutBeforeExit ?? 5000);
        } else {
          doReject();
        }

        return true;
      };

      const onChildProcessError = (error?: any) => {
        setError(error, true);
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        const throwOnExitCode = options.throwOnExitCode;
        const exitCode = code || signal || 0;
        this.#state.exitCode = exitCode;

        if ((throwOnExitCode || throwOnExitCode === undefined) && (code || code === null)) {
          exitError.exitCode = exitCode;
          setError(exitError, false);
        }

        if (errored) {
          doReject();
        }

        if (state.status === "pending") {
          state.status = "succeeded";
          timed.end();
          resolve({ exitCode });
        }
      };

      try {
        if (childProcess instanceof Error) {
          const error = childProcess;
          state.child = Object.create(ChildProcess.prototype);
          setError(error, false);
        } else {
          timed.start();
          if (typeof childProcess === "function") {
            AbortError.throwIfSignalAborted(options.signal);
            childProcess = childProcess();
          }
          state.child = childProcess;
          childProcess.on("error", onChildProcessError);
          childProcess.on("exit", onExit);
          AbortError.throwIfSignalAborted(options.signal);
        }
      } catch (error) {
        setError(error, false);
      }
    };

    super(runProcessPromise);
    this.#state = state;
  }

  /** Calls a function passing this instance as argument. */
  with(fn: (self: this) => void): this {
    fn(this);
    return this;
  }

  /** The child process currently running */
  public get childProcess(): ChildProcess {
    return this.#state.child!;
  }

  /** Promise status. "pending" | "succeeded" | "rejected" */
  public get status(): Deferred.Status {
    return this.#state.status;
  }

  /** If there was an error, this property contains it */
  public get error(): Error | null {
    return this.#state.error;
  }

  /** True if running */
  public get isPending() {
    return this.#state.status === "pending";
  }

  /** True if completed, with or without errors */
  public get isSettled() {
    return this.#state.status !== "pending";
  }

  /** True if completed without errors */
  public get isSucceeded() {
    return this.#state.status === "succeeded";
  }

  /** True if failed */
  public get isRejected() {
    return this.#state.status === "rejected";
  }

  public get title(): string {
    return this.#state.title;
  }

  public get exitCode(): number | NodeJS.Signals | null {
    return this.#state.exitCode;
  }

  public static get [Symbol.species]() {
    return Promise;
  }
}
