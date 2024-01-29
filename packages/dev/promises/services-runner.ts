import { setImmediate } from "node:timers/promises";
import { devError } from "../dev-error";
import { abortSignals } from "./abort-signals";
import { AbortError } from "./abort-error";
import { runParallel, runSequential } from "./promises";
import { setTimeout } from "timers/promises";
import { Main } from "../main";
import type { UnsafeAny } from "../types";
import { serviceRunnerServiceSymbol } from "./service-runner-types";

export namespace ServicesRunner {
  export interface Options {
    abortController?: AbortController | undefined;
    abortOnServiceTermination?: boolean | undefined;
    abortOnServiceError?: boolean | undefined;
    runOptions?: ServicesRunner.RunOptions | undefined;
  }

  export interface ServiceOptions {
    abortOnServiceError?: boolean | undefined;
    abortOnServiceTermination?: boolean | undefined;
    onTerminate?: ((error: Error | null) => void | Promise<void>) | undefined;
  }

  export interface RunOptions {
    onServiceError?:
      | ((error: Error, serviceName: string | undefined) => void | Promise<void>)
      | null
      | undefined
      | false;

    onFinally?: ((error: Error | null) => void | Promise<void>) | undefined;

    /** Replaces standard SIGINT, SIGTERM, SIGBREAK, SIGHUP and uncaughtException handlers with abortController.abort during run */
    registerProcessTermination?: boolean | undefined;

    /** Default to true */
    abortOnError?: boolean | undefined;

    /** Default to true */
    abortWhenFinished?: boolean | undefined;
  }

  export interface AwaitAllOptions {
    onError?: ((error: Error, serviceName?: string | undefined) => void | Promise<void>) | null | undefined;
    abortOnError?: boolean | undefined;
    awaitRun?: boolean | undefined;
    rejectOnError?: boolean | undefined;
  }

  export interface Service {
    [serviceRunnerServiceSymbol](runner: ServicesRunner): void | Promise<void>;
  }
}

interface ServiceRunnerPendingEntry {
  title: string;
  promise: Promise<Error | null>;
}

const { defineProperty } = Reflect;

export class ServicesRunner implements AbortController {
  public abortController: AbortController;

  private _pending: ServiceRunnerPendingEntry[] = [];
  private _activeRunPromises: Promise<unknown>[] = [];

  public static readonly serviceRunnerServiceSymbol: typeof serviceRunnerServiceSymbol = serviceRunnerServiceSymbol;

  public static isServiceRunnerService(value: unknown): value is ServicesRunner.Service {
    return (
      typeof value === "object" &&
      value !== null &&
      serviceRunnerServiceSymbol in value &&
      typeof (value as ServicesRunner.Service)[serviceRunnerServiceSymbol] === "function"
    );
  }

  public static defaultRunOptions: ServicesRunner.RunOptions = {
    abortOnError: true,
    abortWhenFinished: true,
  };

  public abortOnServiceTermination: boolean;
  public abortOnServiceError: boolean;
  public defaultRunOptions: ServicesRunner.RunOptions;

  public constructor(options: ServicesRunner.Options = {}) {
    this.abortController = options.abortController || new AbortController();

    this.abortOnServiceTermination = options.abortOnServiceTermination ?? true;
    this.abortOnServiceError = options.abortOnServiceError ?? true;
    this.defaultRunOptions = { ...ServicesRunner.defaultRunOptions, ...options.runOptions };

    this.startService = this.startService.bind(this);
    this.awaitAll = this.awaitAll.bind(this);
    this.run = this.run.bind(this);
    this.rejectIfAborted = this.rejectIfAborted.bind(this);
    this.throwIfAborted = this.throwIfAborted.bind(this);
    this.getAbortReason = this.getAbortReason.bind(this);
    this.abort = this.abort.bind(this);
    this.setTimeout = this.setTimeout.bind(this);
  }

  public get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  public get signal(): AbortSignal & { reason?: UnsafeAny | undefined } {
    return this.abortController.signal;
  }

  /** If the signal was aborted, returns a promise that rejects to an AbortError. If not, does nothing. */
  public rejectIfAborted(): Promise<void> {
    return abortSignals.rejectIfAborted(this.signal);
  }

  /** If the signal was aborted,throws an AbortError. If not, does nothing. */
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

  public async setTimeout<R = void>(delay: number, value?: R | undefined): Promise<R> {
    return setTimeout(delay, value, { signal: this.signal });
  }

  public get runningServices(): number {
    return this._pending.length;
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
  public addAbortHandler(handler: abortSignals.AddAbortAsyncHandlerArg | null | undefined | false | void): () => void {
    return abortSignals.addAsyncAbortHandler(this.signal, handler);
  }

  /**
   * Removes an abort handler previously registered with addAbortHandler
   */
  public removeAbortHandler(
    handler: abortSignals.AddAbortAsyncHandlerArg | abortSignals.AddAbortHandlerArg | null | undefined | false | void,
  ): void {
    return abortSignals.removeAbortHandler(this.signal, handler);
  }

  /**
   * Adds a pending promise. You can await all pending promises with this.awaitAll.
   * You can wait all pending promises with this.awaitAll() or this,run().
   * Errors will be ignored.
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
    fnOrPromise:
      | Promise<unknown>
      | Promise<ServicesRunner.Service>
      | ((this: ServicesRunner) => Promise<unknown>)
      | ((this: ServicesRunner) => unknown)
      | ((this: ServicesRunner) => Promise<ServicesRunner.Service>)
      | ((this: ServicesRunner) => ServicesRunner.Service)
      | null
      | undefined
      | false,
    options?: ServicesRunner.ServiceOptions | undefined,
  ): boolean {
    if (!fnOrPromise) {
      return false;
    }
    title = `${title}`;

    const runService = async (): Promise<Error | null> => {
      const abortOnServiceTermination = options?.abortOnServiceTermination ?? this.abortOnServiceTermination;
      let error = null;

      try {
        if (ServicesRunner.isServiceRunnerService(fnOrPromise)) {
          const svc = fnOrPromise;
          fnOrPromise = (): void | Promise<void> => svc[serviceRunnerServiceSymbol](this);
        }

        if (typeof fnOrPromise === "function") {
          if (this.aborted) {
            this.throwIfAborted();
          }

          const fn = fnOrPromise;
          const _runService = async (): Promise<unknown> => {
            const result = await fn.call(this);
            return ServicesRunner.isServiceRunnerService(result) ? result[serviceRunnerServiceSymbol](this) : result;
          };

          if (abortSignals.getSignal() !== this.signal) {
            await abortSignals.withAbortSignal(this.signal, _runService);
          } else {
            await _runService();
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
    this._pending.push({ promise, title });
    return true;
  }

  /**
   * Awaits all pending promises.
   * Throws the first error or the reject reason if an error or an AbortError.
   */
  public async awaitAll(options?: ServicesRunner.AwaitAllOptions | undefined): Promise<void> {
    const abortReason = this.getAbortReason();
    let errorToThrow: Error | null = abortReason instanceof Error ? abortReason : null;
    const abortOnError = options?.abortOnError ?? true;
    for (;;) {
      const entry = await _pendingPop(this._pending);
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
      await abortSignals.signalAwaitPendingPromises(this.signal);
    } catch {}

    if (options?.awaitRun) {
      for (;;) {
        const promise = await _pendingPop(this._activeRunPromises);
        if (!promise) {
          break;
        }
        let error: Error | null = null;
        try {
          await (promise as unknown);
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

      try {
        await abortSignals.signalAwaitPendingPromises(this.signal);
      } catch {}
    }

    if (options?.rejectOnError ?? true) {
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

      this.throwIfAborted();
    }
  }

  /**
   * Runs a function with this abort controller as shared abort controller.
   */
  public async run<T>(
    callback: (() => T | Promise<T>) | Promise<T>,
    options: ServicesRunner.RunOptions = {},
  ): Promise<T> {
    options = { ...this.defaultRunOptions, ...options };

    let promise: Promise<T> | undefined;
    let error: null | Error = null;

    const run = async (): Promise<T> => {
      const abortOnError = options.abortOnError ?? true;
      const terminationRegistered =
        options.registerProcessTermination ?? abortSignals.processTerminationOptions.registerProcessTerminationDuringRun
          ? abortSignals.registerProcessTermination(this)
          : null;

      try {
        if (this.aborted) {
          const reason = this.getAbortReason();
          if (reason instanceof Error) {
            throw reason;
          }
          this.throwIfAborted();
        }
        const result = await (typeof callback === "function" ? callback() : callback);
        await this.awaitAll(options);
        if (options.abortWhenFinished) {
          const ok = new AbortError.AbortOk();
          this.abort(ok);
          try {
            await this.awaitAll(options);
          } catch (e) {
            if (e !== ok) {
              throw devError(e);
            }
          }
        }
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
        if (typeof options.onFinally === "function") {
          try {
            await options.onFinally(error);
          } catch {}
        }
        terminationRegistered?.unregister();
        if (promise) {
          const indexOfPromise = this._activeRunPromises.indexOf(promise);
          if (indexOfPromise >= 0) {
            void this._activeRunPromises.splice(indexOfPromise, 1);
          }
          promise = undefined;
        }
      }
    };

    promise = abortSignals.withAbortSignal(this.signal, Main.ref.wrapAsyncFunction(run));
    this._activeRunPromises.push(promise);
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
