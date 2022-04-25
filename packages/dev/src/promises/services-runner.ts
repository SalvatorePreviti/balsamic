import { setImmediate } from "node:timers/promises";
import { devError } from "../dev-error";
import { abortSignals } from "./abort-signals";
import { AbortError } from "./abort-error";
import { runParallel, runSequential } from "./promises";
import { setTimeout } from "timers/promises";

const { defineProperty } = Reflect;

export namespace ServicesRunner {
  export interface Options {
    abortController?: AbortController;
    abortOnServiceTermination?: boolean;
    abortOnServiceError?: boolean;

    /** Replaces standard SIGINT, SIGTERM, SIGBREAK, SIGHUP and uncaughtException handlers with abortController.abort during run */
    registerProcessTerminationDuringRun?: boolean;
  }

  export interface ServiceOptions {
    abortOnServiceError?: boolean;
    abortOnServiceTermination?: boolean;
    onTerminate?: (error: Error | null) => void | Promise<void>;
  }

  export interface RunOptions {
    onServiceError?:
      | ((error: Error, serviceName: string | undefined) => void | Promise<void>)
      | null
      | undefined
      | false;

    onFinally?: (error: Error | null) => void | Promise<void>;

    /** Replaces standard SIGINT, SIGTERM, SIGBREAK, SIGHUP and uncaughtException handlers with abortController.abort during run */
    registerProcessTermination?: boolean;

    abortOnError?: boolean;
  }

  export interface AwaitAllOptions {
    onError?: ((error: Error, serviceName?: string | undefined) => void | Promise<void>) | null | undefined;
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
  #activeRunPromises: Promise<unknown>[] = [];
  #registerProcessTerminationDuringRun: boolean | undefined;

  public abortOnServiceTermination: boolean;
  public abortOnServiceError: boolean;

  public constructor(options: ServicesRunner.Options) {
    this.abortController = options.abortController || new AbortController();

    this.abortOnServiceTermination = options.abortOnServiceTermination ?? true;
    this.abortOnServiceError = options.abortOnServiceError ?? true;
    this.#registerProcessTerminationDuringRun = options.registerProcessTerminationDuringRun;

    this.startService = this.startService.bind(this);
    this.awaitAll = this.awaitAll.bind(this);
    this.run = this.run.bind(this);
    this.rejectIfAborted = this.rejectIfAborted.bind(this);
    this.getAbortReason = this.getAbortReason.bind(this);
    this.abort = this.abort.bind(this);
    this.setTimeout = this.setTimeout.bind(this);
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

  public throwIfAborted(): void {
    return abortSignals.throwIfAborted(this.signal);
  }

  /** If a signal is aborted, it returns the abort reason. Returns undefined otherwise. */
  public getAbortReason<Reason = unknown>(): Reason | undefined {
    return abortSignals.getAbortReason<Reason>(this.signal);
  }

  /** Aborts the abort controller, with a reason. */
  public abort(reason?: unknown): boolean {
    return abortSignals.abort(this.abortController, reason);
  }

  public async setTimeout<R = void>(delay: number, value?: R): Promise<R> {
    return setTimeout(delay, value, { signal: this.signal });
  }

  public get runningServices(): number {
    return this.#pending.length;
  }

  public runSequential(...functionsOrPromises: unknown[]): Promise<void> {
    if (abortSignals.getSignal() !== this.signal) {
      return abortSignals.withAbortSignal(this.signal, () => runSequential(functionsOrPromises));
    }
    return runSequential(functionsOrPromises);
  }

  public runParallel(...functionsOrPromises: unknown[]): Promise<void> {
    if (abortSignals.getSignal() !== this.signal) {
      return abortSignals.withAbortSignal(this.signal, () => runParallel(functionsOrPromises));
    }
    return runParallel(functionsOrPromises);
  }

  /**
   * Adds a new asynchronous function to be executed on abort.
   * If already aborted, the function will be called straight away.
   * The promise will be added to the signal with `signalAddPendingPromise`.
   * User is responsible to await for those promises with `signalAwaitPendingPromises`.
   *
   * @returns A function that when called removes the abort handler.
   * If the handler was not added, the function noop() will be returned.
   * You can check for equality with noop function to check if the handler was not added.
   */
  public addAbortHandler(handler: abortSignals.AddAbortAsyncHandlerArg | null | undefined | false | void) {
    return abortSignals.addAsyncAbortHandler(this.signal, handler);
  }

  /**
   * Removes an abort handler previously registered with addAbortHandler
   */
  public removeAbortHandler(
    handler: abortSignals.AddAbortAsyncHandlerArg | abortSignals.AddAbortHandlerArg | null | undefined | false | void,
  ) {
    return abortSignals.removeAbortHandler(this.signal, handler);
  }

  /**
   * Adds a pending promise. You can await all pending promises with this.awaitAll.
   * You can wait all pending promises with this.awaitAll() or this,run().
   * @returns a function that if called removes the promise from the pending promises.
   */
  public addPendingPromise(promise: Promise<unknown> | null | undefined | void): () => void {
    return abortSignals.signalAddPendingPromise(this.signal, promise);
  }

  /** Removes a pending promise previously added with addPendingPromise. */
  public removePendingPromise(promise: Promise<unknown> | null | undefined | void): boolean {
    return abortSignals.signalRemovePendingPromise(this.signal, promise);
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
            await abortSignals.withAbortSignal(this.signal, fnOrPromise);
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

    const promise = runService();
    this.#pending.push({ promise, title });
    return true;
  }

  /**
   * Awaits all pending promises.
   * Throws the first error or the reject reason if an error or an AbortError.
   */
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

    try {
      abortSignals.signalAwaitPendingPromises(this.signal, options);
    } catch (e) {
      const error = devError(e);
      if (!errorToThrow || (AbortError.isAbortError(errorToThrow) && !AbortError.isAbortError(error))) {
        errorToThrow = error;
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

  /**
   * Runs a function with this abort controller as shared abort controller.
   */
  public async run<T>(callback: (() => T | Promise<T>) | Promise<T>, options?: ServicesRunner.RunOptions): Promise<T> {
    let promise: Promise<T> | undefined;
    let error: null | Error = null;

    const run = async () => {
      const abortOnError = options?.abortOnError ?? true;
      const terminationRegistered =
        options?.registerProcessTermination ??
        this.#registerProcessTerminationDuringRun ??
        abortSignals.processTerminationOptions.registerProcessTerminationDuringRun
          ? abortSignals.registerProcessTermination(this)
          : null;

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
        terminationRegistered?.unregister();
        if (promise) {
          const indexOfPromise = this.#activeRunPromises.indexOf(promise);
          if (indexOfPromise >= 0) {
            this.#activeRunPromises.splice(indexOfPromise, 1);
          }
          promise = undefined;
        }
      }
    };

    promise = abortSignals.withAbortSignal(this.signal, run);
    this.#activeRunPromises.push(promise);
    return promise;
  }
}

async function _pendingPop<T>(array: T[] | null): Promise<T | undefined> {
  if (array) {
    let item: T | undefined;
    for (let tick = 0; tick < 3; ++tick) {
      item = array.pop();
      if (item !== undefined) {
        return item;
      }
      await setImmediate();
    }
  }
  return undefined;
}
