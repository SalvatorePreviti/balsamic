import { devError } from "../dev-error";
import type { UnsafeAny } from "../types";
import { noop } from "../utils/utils";
import type { MaybeSignal } from "./abort-signals";
import { abortSignals } from "./abort-signals";

export namespace Deferred {
  export type Status = "starting" | "pending" | "succeeded" | "rejected";

  export interface Options {}
}

export class Deferred<T = void> {
  public static readonly STATUS_PENDING = "pending" as const;
  public static readonly STATUS_SUCCEEDED = "succeeded" as const;
  public static readonly STATUS_REJECTED = "rejected" as const;

  public status: Deferred.Status = "pending";
  public error: Error | null = null;
  public result: T | undefined = undefined;
  public promise: Promise<T>;
  public resolve: T extends undefined ? () => void : (value: T) => void = noop as UnsafeAny;
  public reject: (error: unknown) => void = noop;
  private _unhandledRejectionIgnored?: true | undefined;

  public constructor(
    fn?: ((this: Deferred<T>, resolve: (value: T) => void, reject: (error: unknown) => void) => void) | undefined,
  ) {
    this.promise = new Promise<T>((_resolve, _reject) => {
      const resolve = (value: UnsafeAny): void => {
        if (this.status === "pending") {
          this.status = "succeeded";
          this.result = value;
          _resolve(value);
        }
      };
      const reject = (error: unknown): void => {
        if (this.status === "pending") {
          this.status = "rejected";
          _reject((this.error = devError(error, reject)));
        }
      };
      this.resolve = resolve as UnsafeAny;
      this.reject = reject;
      fn?.call(this, resolve, reject);
    });
  }

  /** True if running */
  public get isRunning(): boolean {
    return this.status === "pending" || this.status === "starting";
  }

  /** True if completed, with or without errors */
  public get isSettled(): boolean {
    return this.status === "succeeded" || this.status === "rejected";
  }

  /** True if completed without errors */
  public get isSucceeded(): boolean {
    return this.status === "succeeded";
  }

  /** True if failed */
  public get isRejected(): boolean {
    return this.status === "rejected";
  }

  /**
   * Makes the promise to not cause an UnhandledRejection if not catch.
   */
  public ignoreUnhandledRejection(): this {
    if (!this._unhandledRejectionIgnored) {
      this._unhandledRejectionIgnored = true;
      this.promise.catch(noop);
    }
    return this;
  }

  /**
   * Attaches an AbortSignal to this Deferred instance. When an abort signal gets aborted, the promise gets rejected with an AbortError.
   */
  public attachAbortSignal(abortSignal?: MaybeSignal): this {
    if (!this.isRunning) {
      return this;
    }

    abortSignal = abortSignals.getSignal(abortSignal);
    if (!abortSignal) {
      return this;
    }

    const abortError = abortSignals.getAbortError(abortSignal);
    if (abortError) {
      this.reject(abortError);
      return this;
    }

    const removeHandler = abortSignals.addAbortHandler(abortSignal, this);

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.promise.finally(removeHandler);

    return this;
  }
}
