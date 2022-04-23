import { devError } from "../dev-error";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { AbortControllerWrapper } from "./abort-controller-wrapper";
import { withAbortSignal } from "./with-abort-signal";
import { AbortError } from "./abort-error";

export interface ServicesRunnerOptions {
  abortController?: AbortController;
  abortOnServiceTermination?: boolean;
  abortOnServiceError?: boolean;
}

export interface ServicesRunnerServiceOptions extends DevLogTimeOptions {
  abortOnServiceError?: boolean;
  abortOnServiceTermination?: boolean;
  onOk?: () => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  onFinally?: () => void | Promise<void>;
}

interface ServiceRunnerPendingEntry {
  title: string;
  promise: Promise<unknown>;
}

export class ServicesRunner extends AbortControllerWrapper {
  #pending: ServiceRunnerPendingEntry[] = [];
  #abortHandlers: (() => void | Promise<void>)[] = [];
  #pendingPromises: Promise<unknown>[] = [];

  public abortOnServiceTermination: boolean;
  public abortOnServiceError: boolean;

  public constructor(options: ServicesRunnerOptions) {
    super(options.abortController || new AbortController());

    this.abortOnServiceTermination = options.abortOnServiceTermination ?? true;
    this.abortOnServiceError = options.abortOnServiceError ?? true;

    const onAbort = () => {
      this.getOrCreateAbortError({ caller: onAbort });
      const handlers = this.#abortHandlers;
      this.#abortHandlers = [];
      for (const fn of handlers) {
        try {
          this.#addPendingPromise(fn());
        } catch (e) {
          if (e) {
            this.#addPendingPromise(Promise.reject(devError(e)));
          }
        }
      }
    };

    super.addAbortHandler(onAbort);

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
      this.#abortHandlers.push(fn);
    }
  }

  public get runningServices(): number {
    return this.#pending.length;
  }

  public startService(
    title: string,
    fnOrPromise: Promise<void> | (() => Promise<void> | void) | null | undefined | false,
    options?: ServicesRunnerServiceOptions,
  ): boolean {
    if (!fnOrPromise) {
      return false;
    }
    if (typeof fnOrPromise === "function") {
      this.throwIfAborted();
    } else {
      for (const pending of this.#pending) {
        if (pending.promise === fnOrPromise) {
          return false;
        }
      }
    }
    const promise = this.#runService(title, fnOrPromise, options);
    this.#pending.push({ promise, title });
    return true;
  }

  public async awaitAll(): Promise<void> {
    const errorsSet = new Set<Error>();
    for (;;) {
      const entry = _pendingPop(this.#pending);
      if (entry === undefined) {
        break;
      }
      try {
        await entry.promise;
      } catch (e) {
        const error = devError(e);
        if (!error.serviceTitle) {
          error.serviceTitle = entry.title;
        }
        errorsSet.add(error);
        if (!this.aborted) {
          this.abort(error, { caller: ServicesRunner.prototype.awaitAll, cause: error });
        }
      }
    }

    for (;;) {
      const promise = _pendingPop(this.#pendingPromises);
      if (promise === undefined) {
        break;
      }
      try {
        await promise;
      } catch (e) {
        if (e) {
          errorsSet.add(devError(e));
        }
      }
    }

    const errors = Array.from(errorsSet);
    if (errors.length > 0) {
      Reflect.defineProperty(errors[0], "errors", {
        value: errors,
        configurable: true,
        enumerable: false,
        writable: true,
      });
      throw errors[0];
    }
  }

  public async run<T>(callback: () => T | Promise<T>): Promise<T> {
    const run = async () => {
      try {
        const result = await callback();
        await this.awaitAll();
        return result;
      } catch (e) {
        let error = devError(e, this.run);

        const abortError =
          this.aborted &&
          AbortError.isAbortError(error) &&
          withAbortSignal.getOrCreateAbortError.hasAbortError(this.signal) &&
          this.getAbortError();

        if (abortError) {
          error = abortError;
        } else {
          this.abort(error, { caller: ServicesRunner.prototype.run, cause: error });
        }

        try {
          await this.awaitAll();
        } catch {}
        throw error;
      }
    };
    return withAbortSignal.run(this.signal, run);
  }

  async #runService(
    title: string,
    fnOrPromise: Promise<void> | (() => Promise<void> | void),
    options?: ServicesRunnerServiceOptions,
  ): Promise<void> {
    if (this.aborted) {
      return;
    }
    options = { timed: false, logError: true, ...options };
    const abortOnServiceTermination = options.abortOnServiceTermination ?? this.abortOnServiceTermination;
    try {
      await devLog.timed(
        title,
        typeof fnOrPromise === "function" ? () => withAbortSignal.run(this.signal, fnOrPromise) : fnOrPromise,
        options,
      );
      if (options.onOk) {
        this.throwIfAborted();
        await options.onOk();
      }
      if (abortOnServiceTermination) {
        this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title, isOk: false }));
      }
    } catch (e) {
      const error = devError(e);
      if (!error.serviceTitle) {
        error.serviceTitle = title;
      }
      try {
        if (options.onError) {
          await options.onError(error);
        }
      } catch {}
      const abortOnServiceError = options.abortOnServiceError ?? this.abortOnServiceError;
      if (abortOnServiceError) {
        this.abort(error);
      } else if (abortOnServiceTermination) {
        this.abort(
          new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title, isOk: false, cause: error }),
        );
      }
      if (options.onFinally) {
        options.onFinally();
      }
      throw error;
    }
    if (options.onFinally) {
      options.onFinally();
    }
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

function _pendingPop<T>(array: T[]): T | undefined {
  let item: T | undefined;
  for (let tick = 0; tick < 3; ++tick) {
    item = array.pop();
    if (item !== undefined) {
      return item;
    }
  }
  return undefined;
}