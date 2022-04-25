import { setImmediate } from "node:timers/promises";
import { devError } from "../dev-error";
import { abortSignals } from "./abort-signals";
import { AbortError } from "./abort-error";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { runParallel, runSequential } from "./promises";
import { setTimeout } from "timers/promises";
import nodeGraceful from "node-graceful";

export { nodeGraceful };

const { defineProperty } = Reflect;

export namespace ServicesRunner {
  export interface Options {
    abortController?: AbortController;
    abortOnServiceTermination?: boolean;
    abortOnServiceError?: boolean;
    registerGracefulExit?: boolean;
  }

  export interface ServiceOptions {
    abortOnServiceError?: boolean;
    abortOnServiceTermination?: boolean;
    onTerminate?: (error: Error | null) => void | Promise<void>;
    timed?: boolean;
  }

  export interface RunOptions {
    onError?: ((error: Error, serviceName: string | undefined) => void | Promise<void>) | null | undefined | false;
    onFinally?: (error: Error | null) => void | Promise<void>;
    onGracefulExit?: (signal: string, details?: object) => void | Promise<void>;

    abortOnError?: boolean;
    registerGracefulExit?: boolean;
  }

  export interface AwaitAllOptions {
    onError?: ((error: Error, serviceName: string | undefined) => void | Promise<void>) | null | undefined | false;
    abortOnError?: boolean;
    awaitRun?: boolean;
  }
}

interface ServiceRunnerPendingEntry {
  title: string;
  promise: Promise<Error | null>;
}

export class ServicesRunner implements AbortController {
  public abortController: AbortController;

  #pending: ServiceRunnerPendingEntry[] = [];
  #abortHandlers: (() => void | Promise<void>)[] | null = null;
  #pendingPromises: Promise<unknown>[] = [];
  #activeRunPromises: Promise<unknown>[] = [];
  #registerGracefulExit: boolean = false;

  public abortOnServiceTermination: boolean;
  public abortOnServiceError: boolean;

  public constructor(options: ServicesRunner.Options) {
    this.abortController = options.abortController || new AbortController();

    this.abortOnServiceTermination = options.abortOnServiceTermination ?? true;
    this.abortOnServiceError = options.abortOnServiceError ?? true;
    this.#registerGracefulExit = !!options.registerGracefulExit;

    this.startService = this.startService.bind(this);
    this.awaitAll = this.awaitAll.bind(this);
    this.run = this.run.bind(this);
    this.rejectIfAborted = this.rejectIfAborted.bind(this);
    this.getAbortReason = this.getAbortReason.bind(this);
    this.abort = this.abort.bind(this);
    this.setTimeout = this.setTimeout.bind(this);
    this.addAbortHandler = this.addAbortHandler.bind(this);
  }

  public get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  public get signal(): AbortSignal & { reason?: any } {
    return this.abortController.signal;
  }

  /** If the signal was aborted, throws an AbortError. If not, does nothing. */
  public rejectIfAborted(): Promise<void> {
    return abortSignals.rejectIfAborted(this.signal);
  }

  /** If a signal is aborted, it returns the abort reason. Returns undefined otherwise. */
  public getAbortReason(): unknown {
    return abortSignals.getAbortReason(this.signal);
  }

  /** Aborts the abort controller, with a reason. */
  public abort(reason?: unknown): boolean {
    return abortSignals.abort(this.abortController, reason);
  }

  public async setTimeout<R = void>(delay: number, value?: R): Promise<R> {
    return setTimeout(delay, value, { signal: this.signal });
  }

  /**
   * Adds a new function to execute on abort.
   * If already aborted, the function will be called straight away.
   */
  public addAbortHandler(fn: (() => void | Promise<void>) | null | undefined | false): void {
    if (typeof fn !== "function") {
      return;
    }
    if (this.aborted) {
      this.#addPendingPromise(fn());
    } else {
      (this.#abortHandlers || this.#initPendingPromisesArray()).push(fn);
    }
  }

  #initPendingPromisesArray() {
    const handlers: (() => void | Promise<void>)[] = [];
    this.#abortHandlers = handlers;

    const onAbort = async () => {
      for (;;) {
        const handler = await _pendingPop(handlers);
        if (!handler) {
          break;
        }
        try {
          this.#addPendingPromise(handler());
        } catch (e) {
          if (e) {
            this.#addPendingPromise(Promise.reject(devError(e)));
          }
        }
      }
    };

    abortSignals.addAbortHandler(this.signal, onAbort);
    return handlers;
  }

  public get runningServices(): number {
    return this.#pending.length;
  }

  public runSequential(...functionsOrPromises: unknown[]): Promise<void> {
    if (abortSignals.getSignal() !== this.signal) {
      return abortSignals.run(this.signal, () => runSequential(functionsOrPromises));
    }
    return runSequential(functionsOrPromises);
  }

  public runParallel(...functionsOrPromises: unknown[]): Promise<void> {
    if (abortSignals.getSignal() !== this.signal) {
      return abortSignals.run(this.signal, () => runParallel(functionsOrPromises));
    }
    return runParallel(functionsOrPromises);
  }

  public timed<T>(title: string, fnOrPromise: (() => Promise<T> | T) | Promise<T> | T, options?: DevLogTimeOptions) {
    if (typeof fnOrPromise === "function" && abortSignals.getSignal() !== this.signal) {
      return abortSignals.run(this.signal, () => devLog.timed(title, fnOrPromise, options));
    }
    return devLog.timed(title, fnOrPromise, options);
  }

  public startService(
    title: string,
    fnOrPromise: Promise<unknown> | (() => Promise<unknown> | void) | null | undefined | false,
    options?: ServicesRunner.ServiceOptions,
  ): boolean {
    if (!fnOrPromise) {
      return false;
    }
    title = `${title}`;

    const runService = async () => {
      const abortOnServiceTermination = options?.abortOnServiceTermination ?? this.abortOnServiceTermination;
      let error = null;

      try {
        if (typeof fnOrPromise === "function") {
          if (this.aborted) {
            await this.rejectIfAborted();
          }

          if (abortSignals.getSignal() !== this.signal) {
            await abortSignals.run(this.signal, fnOrPromise);
          } else {
            await fnOrPromise();
          }
        } else {
          await fnOrPromise;
        }

        if (!this.aborted && abortOnServiceTermination) {
          this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title }));
        }
      } catch (e) {
        error = devError(e);
        if (!AbortError.isAbortError(error) && !error.serviceTitle) {
          defineProperty(error, "serviceTitle", {
            value: title,
            configurable: true,
            enumerable: true,
            writable: true,
          });
        }

        if (!this.aborted) {
          if (options?.abortOnServiceError ?? this.abortOnServiceError) {
            this.abort(error);
          } else if (abortOnServiceTermination) {
            this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title, cause: error }));
          }
        }
      }
      if (options?.onTerminate) {
        await options.onTerminate(error);
      }
      return error;
    };

    defineProperty(runService, "name", { value: title, configurable: true, enumerable: false });

    const promise = options?.timed ? this.timed(title, runService, { abortErrorIsWarning: true }) : runService();
    this.#pending.push({ promise, title });
    return true;
  }

  public async awaitAll(options?: ServicesRunner.AwaitAllOptions): Promise<void> {
    const abortReason = this.getAbortReason();
    let errorToThrow: Error | null = abortReason instanceof Error ? abortReason : null;
    const abortOnError = options?.abortOnError ?? true;
    for (;;) {
      const entry = await _pendingPop(this.#pending);
      if (entry === undefined) {
        break;
      }
      let error: Error | null;
      try {
        error = await entry.promise;
      } catch (e) {
        error = devError(e);
      }

      if (error) {
        if (!errorToThrow || (AbortError.isAbortError(errorToThrow) && !AbortError.isAbortError(error))) {
          errorToThrow = error;
        }
        if (!this.aborted && abortOnError) {
          this.abort(error);
        }

        if (options && typeof options.onError === "function") {
          await options.onError(error, entry.title);
        }
      }
    }

    for (;;) {
      const promise = await _pendingPop(this.#pendingPromises);
      if (promise === undefined) {
        break;
      }
      try {
        await promise;
      } catch (e) {
        if (e) {
          const error = devError(e);
          if (!errorToThrow || (AbortError.isAbortError(errorToThrow) && !AbortError.isAbortError(error))) {
            errorToThrow = error;
          }

          if (options && typeof options.onError === "function") {
            await options.onError(error, undefined);
          }
        }
      }
    }

    if (options?.awaitRun) {
      for (;;) {
        const promise = await _pendingPop(this.#activeRunPromises);
        if (!promise) {
          break;
        }
        let error: Error | null = null;
        try {
          await promise;
        } catch (e) {
          error = devError(e);
        }

        if (error) {
          if (!errorToThrow || (AbortError.isAbortError(errorToThrow) && !AbortError.isAbortError(error))) {
            errorToThrow = error;
          }
          if (!this.aborted && abortOnError) {
            this.abort(error);
          }
        }
      }
    }

    if (errorToThrow) {
      if (AbortError.isAbortError(errorToThrow)) {
        const reason = this.getAbortReason();
        if (reason instanceof Error) {
          throw reason;
        }
      }
      throw errorToThrow;
    }

    const reason = this.getAbortReason();
    if (reason instanceof Error) {
      throw reason;
    }

    return this.rejectIfAborted();
  }

  protected onRunGracefulExit(signal: string, _details?: object): void | Promise<void> {
    if (!this.aborted) {
      if (signal) {
        devLog.log();
        devLog.hr("red");
        devLog.logRedBright(`😵 EXIT: ${signal}`);
        devLog.hr("red");
        devLog.log();
      }
      this.abort(signal);
    }
  }

  public async run<T>(callback: (() => T | Promise<T>) | Promise<T>, options?: ServicesRunner.RunOptions): Promise<T> {
    let promise: Promise<T> | undefined;
    let error: null | Error = null;

    const onExitHandler = async (signal: string, details?: object) => {
      await this.onRunGracefulExit(signal, details);
      if (typeof options?.onGracefulExit === "function") {
        await options?.onGracefulExit(signal, details);
      }
      return this.awaitAll({ awaitRun: true });
    };

    const run = async () => {
      let gracefulExitRegistered = false;
      if (options?.registerGracefulExit ?? this.#registerGracefulExit) {
        gracefulExitRegistered = true;
        nodeGraceful.on("exit", onExitHandler);
      }
      const abortOnError = options?.abortOnError ?? true;
      try {
        if (this.aborted) {
          const reason = this.getAbortReason();
          if (reason instanceof Error) {
            throw reason;
          }
          await this.rejectIfAborted();
        }
        const result = await (typeof callback === "function" ? callback() : callback);
        await this.awaitAll(options);
        return result;
      } catch (e) {
        if (AbortError.isAbortError(e)) {
          const reason = this.getAbortReason();
          error = reason instanceof Error ? reason : e;
        } else {
          error = devError(e);
        }
        if (abortOnError && !this.aborted) {
          this.abort(error);
        }
        try {
          await this.awaitAll(options);
        } catch (e1) {
          if (AbortError.isAbortError(e)) {
            if (AbortError.isAbortError(e1)) {
              const reason = this.getAbortReason();
              error = reason instanceof Error ? reason : e1;
            } else {
              error = devError(e1);
            }
          }
        }
        throw error;
      } finally {
        if (typeof options?.onFinally === "function") {
          try {
            await options.onFinally(error);
          } catch {}
        }
        if (gracefulExitRegistered) {
          nodeGraceful.off("exit", onExitHandler);
        }
        if (promise) {
          const indexOfPromise = this.#activeRunPromises.indexOf(promise);
          if (indexOfPromise >= 0) {
            this.#activeRunPromises.splice(indexOfPromise, 1);
          }
          promise = undefined;
        }
      }
    };

    promise = abortSignals.run(this.signal, run);
    this.#activeRunPromises.push(promise);
    return promise;
  }

  #addPendingPromise(promise: Promise<unknown> | undefined | null | false | void) {
    if (typeof promise === "object" && promise !== null && typeof promise.then === "function") {
      promise.then(() => {
        const index = this.#pendingPromises.indexOf(promise);
        if (index >= 0) {
          this.#pendingPromises.splice(index, 1);
        }
      });
      if (this.#pendingPromises.indexOf(promise) < 0) {
        this.#pendingPromises.push(promise);
      }
    }
  }
}

async function _pendingPop<T>(array: T[]): Promise<T | undefined> {
  let item: T | undefined;
  for (let tick = 0; tick < 3; ++tick) {
    item = array.pop();
    if (item !== undefined) {
      return item;
    }
    await setImmediate();
  }
  return undefined;
}
