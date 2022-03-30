import { ChildProcess } from "child_process";
import { devError } from "../dev-error";
import type { Deferred } from "../lib/promises";
import { DevLogTimed, DevLogTimeOptions } from "../dev-log";

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
  export interface Options extends DevLogTimeOptions {
    title?: string;
    showStack?: boolean;
    throwOnExitCode?: boolean;
  }
}

export class ProcessPromise extends Promise<ProcessPromiseResult> {
  #state: ProcessPromiseState;

  public static rejectProcessPromise(reason: unknown, options: ProcessPromise.Options = {}): ProcessPromise {
    return new ProcessPromise(devError(reason), options);
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
      const onError = (error?: any) => {
        try {
          if (state.status === "pending") {
            exitError = devError(error || exitError, onError);
            if (state.title) {
              devError.setProperty(exitError, "title", state.title, true);
            }
            state.status = "rejected";
            state.error = exitError;
            timed.fail(exitError);
          }
        } finally {
          reject(exitError);
        }
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        const throwOnExitCode = options.throwOnExitCode;
        const exitCode = code || signal || 0;
        this.#state.exitCode = exitCode;
        if ((throwOnExitCode || throwOnExitCode === undefined) && (code || code === null)) {
          exitError.exitCode = exitCode;
          onError();
        } else if (state.status === "pending") {
          state.status = "succeeded";
          timed.end();
          resolve({ exitCode });
        }
      };

      try {
        if (childProcess instanceof Error) {
          const error = childProcess;
          state.child = Object.create(ChildProcess.prototype);
          onError(error);
        } else {
          timed.start();
          if (typeof childProcess === "function") {
            childProcess = childProcess();
          }
          state.child = childProcess;
          childProcess.on("error", onError);
          childProcess.on("exit", onExit);
        }
      } catch (error) {
        onError(error);
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
