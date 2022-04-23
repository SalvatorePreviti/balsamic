import { setImmediate } from "node:timers/promises";
import { devError } from "../dev-error";
import { AbortControllerWrapper } from "./abort-controller-wrapper";
import { abortSignals } from "./abort-signals";
import { AbortError } from "./abort-error";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { runParallel, runSequential } from "./promises";

const { defineProperty } = Reflect;

export interface ServicesRunnerOptions {
  abortController?: AbortController;
  abortOnServiceTermination?: boolean;
  abortOnServiceError?: boolean;
}

export interface ServicesRunnerServiceOptions {
  abortOnServiceError?: boolean;
  abortOnServiceTermination?: boolean;
  onTerminate?: (error: Error | null) => void | Promise<void>;
  timed?: boolean;
}

interface ServiceRunnerPendingEntry {
  title: string;
  promise: Promise<Error | null>;
}

export class ServicesRunner extends AbortControllerWrapper {
  #pending: ServiceRunnerPendingEntry[] = [];
  #abortHandlers: (() => void | Promise<void>)[] | null = null;
  #pendingPromises: Promise<unknown>[] = [];

  public abortOnServiceTermination: boolean;
  public abortOnServiceError: boolean;

  public constructor(options: ServicesRunnerOptions) {
    super(options.abortController || new AbortController());

    this.abortOnServiceTermination = options.abortOnServiceTermination ?? true;
    this.abortOnServiceError = options.abortOnServiceError ?? true;

    this.startService = this.startService.bind(this);
    this.awaitAll = this.awaitAll.bind(this);
    this.run = this.run.bind(this);
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

    super.addAbortHandler(onAbort);
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
    options?: ServicesRunnerServiceOptions,
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

        if (abortOnServiceTermination) {
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
        const abortOnServiceError = options?.abortOnServiceError ?? this.abortOnServiceError;
        if (abortOnServiceError) {
          this.abort(error);
        } else if (abortOnServiceTermination) {
          this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title, cause: error }));
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

  public async awaitAll(): Promise<void> {
    let errorToThrow: Error | null = null;
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
        if (!errorToThrow) {
          errorToThrow = error;
        }
        if (!this.aborted) {
          this.abort(error);
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
        if (e && !errorToThrow) {
          errorToThrow = devError(e);
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

  public async run<T>(callback: () => T | Promise<T>): Promise<T> {
    const run = async () => {
      try {
        const result = await callback();
        await this.awaitAll();
        return result;
      } catch (e) {
        const error = devError(e, this.run);
        this.abort(error);
        try {
          await this.awaitAll();
        } catch {}
        throw error;
      }
    };
    return abortSignals.run(this.signal, run);
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
