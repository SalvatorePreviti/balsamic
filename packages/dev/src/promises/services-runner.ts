import { setImmediate } from "node:timers/promises";
import { devError } from "../dev-error";
import { DevLogTimed, DevLogTimeOptions } from "../dev-log";
import { AbortControllerWrapper } from "./abort-controller-wrapper";
import { abortSignals } from "./abort-signals";
import { AbortError } from "./abort-error";

export interface ServicesRunnerOptions {
  abortController?: AbortController;
  abortOnServiceTermination?: boolean;
  abortOnServiceError?: boolean;
}

export interface ServicesRunnerServiceOptions extends DevLogTimeOptions {
  abortOnServiceError?: boolean;
  abortOnServiceTermination?: boolean;
  onTerminate?: (error: Error | null) => void | Promise<void>;
}

interface ServiceRunnerPendingEntry {
  title: string;
  promise: Promise<Error | null>;
}

export class ServicesRunner extends AbortControllerWrapper {
  #pending: ServiceRunnerPendingEntry[] = [];
  #abortHandlers: (() => void | Promise<void>)[] | null = null;
  #pendingPromises: Promise<unknown>[] = [];

  /** Default singleton instance */
  public static instance = new ServicesRunner({});

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

  public startService(
    title: string,
    fnOrPromise: Promise<unknown> | (() => Promise<unknown> | void) | null | undefined | false,
    options?: ServicesRunnerServiceOptions,
  ): boolean {
    if (!fnOrPromise) {
      return false;
    }
    title = `${title}`;
    const promise = this.#runService(title, fnOrPromise, options);
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
        if (!error.serviceTitle) {
          error.serviceTitle = entry.title;
        }
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
      throw errorToThrow;
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

  async #runService(
    title: string,
    fnOrPromise: Promise<unknown> | (() => Promise<unknown> | void),
    options?: ServicesRunnerServiceOptions,
  ): Promise<Error | null> {
    options = { timed: false, logError: true, ...options };
    const abortOnServiceTermination = options.abortOnServiceTermination ?? this.abortOnServiceTermination;
    let error = null;

    const _timed = new DevLogTimed(title, options);

    try {
      _timed.start();

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

      _timed.end();

      if (abortOnServiceTermination) {
        this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title }));
      }
    } catch (e) {
      error = devError(e);
      if (!error.serviceTitle) {
        error.serviceTitle = title;
      }
      const abortOnServiceError = options.abortOnServiceError ?? this.abortOnServiceError;
      if (abortOnServiceError) {
        this.abort(error);
      } else if (abortOnServiceTermination) {
        this.abort(new AbortError.ServiceTerminatedError(undefined, { serviceTitle: title, cause: error }));
      }

      _timed.fail(error);
    }
    if (options.onTerminate) {
      await options.onTerminate(error);
    }
    return error;
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
