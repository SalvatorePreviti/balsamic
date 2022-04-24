import { devError } from "../dev-error";
import { abortSignals } from "./abort-signals";

export function noop() {}

export namespace Deferred {
  export type Status = "starting" | "pending" | "succeeded" | "rejected";
}

export class Deferred<T> {
  public static readonly STATUS_PENDING = "pending" as const;
  public static readonly STATUS_SUCCEEDED = "succeeded" as const;
  public static readonly STATUS_REJECTED = "rejected" as const;

  public status: Deferred.Status = "pending";
  public error: Error | null = null;
  public result: T | undefined = undefined;
  public promise: Promise<T>;
  public resolve: T extends undefined ? () => void : (value: T) => void;
  public reject: (error: unknown) => void;
  private _unhandledRejectionIgnored?: true;

  public constructor() {
    this.promise = new Promise<T>((_resolve, _reject) => {
      const resolve = (value: any) => {
        if (this.status === "pending") {
          this.status = "succeeded";
          this.result = value;
          _resolve(value);
        }
      };
      const reject = (error: unknown) => {
        if (this.status === "pending") {
          this.status = "rejected";
          _reject((this.error = devError(error, reject)));
        }
      };
      this.resolve = resolve as any;
      this.reject = reject;
    });
  }

  public ignoreUnhandledRejection(): this {
    if (!this._unhandledRejectionIgnored) {
      this._unhandledRejectionIgnored = true;
      this.promise.catch(noop);
    }
    return this;
  }

  /** True if running */
  public get isRunning() {
    return this.status === "pending" || this.status === "starting";
  }

  /** True if completed, with or without errors */
  public get isSettled() {
    return this.status === "succeeded" || this.status === "rejected";
  }

  /** True if completed without errors */
  public get isSucceeded() {
    return this.status === "succeeded";
  }

  /** True if failed */
  public get isRejected() {
    return this.status === "rejected";
  }
}

/** Runs lists of functions or promises in sequence */
export async function runSequential(...functionsOrPromises: unknown[]): Promise<void> {
  for (let p of functionsOrPromises) {
    if (typeof p === "function") {
      const signal = abortSignals.getSignal();
      if (signal && signal.aborted) {
        await abortSignals.rejectIfAborted(signal);
      }
      p = p();
    }
    if (!p || typeof p === "number" || typeof p === "boolean" || typeof p === "string") {
      continue;
    }
    if (typeof (p as any).then === "function") {
      p = await p;
    }
    if (typeof p === "object" && p !== null && Symbol.iterator in (p as any)) {
      await runSequential(...(p as any));
    }
  }
}

/**
 * Runs lists of functions or promises in parallel.
 * Continue running until all are promises settled.
 * Throws the first error raised, if any.
 */
export async function runParallel(...functionsOrPromises: unknown[]): Promise<void> {
  const promises: Promise<void>[] = [];

  let error: any;
  const handlePromise = async (p: any) => {
    try {
      if (typeof p === "function") {
        const signal = abortSignals.getSignal();
        if (signal && signal.aborted) {
          await abortSignals.rejectIfAborted(signal);
        }
        p = error === undefined && p();
      }
      if (!p || typeof p === "number" || typeof p === "boolean" || typeof p === "string") {
        return undefined;
      }
      if (typeof (p as any).then === "function") {
        p = await p;
      }
      if (typeof p === "object" && p !== null && Symbol.iterator in (p as any)) {
        for (const q of p) {
          promises.push(handlePromise(q));
        }
      }
    } catch (e) {
      if (error === undefined) {
        error = devError(e, runParallel);
      } else {
        try {
          if (!error.errors) {
            error.errors = [];
          }
          error.errors.push(e);
        } catch {}
      }
    }
    return p;
  };

  for (const p of functionsOrPromises) {
    promises.push(handlePromise(p));
  }

  await Promise.all(promises);

  if (error) {
    throw error;
  }
}
