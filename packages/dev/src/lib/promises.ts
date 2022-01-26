import { devError } from "../dev-error";
import { devLog } from "../dev-log";

export function noop() {}

export class Deferred<T> {
  public status: "pending" | "succeeded" | "rejected" = "pending";
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

  public get isPending() {
    return this.status === "pending";
  }

  public get isSettled() {
    return this.status !== "pending";
  }

  public get isSucceeded() {
    return this.status === "succeeded";
  }

  public get isRejected() {
    return this.status === "rejected";
  }
}

/** Runs lists of functions or promises in sequence */
export async function runSequential(...functionsOrPromises: unknown[]): Promise<void> {
  for (let p of functionsOrPromises) {
    if (typeof p === "function") {
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

/** Runs lists of functions or promises in parallel */
export async function runParallel(...functionsOrPromises: unknown[]): Promise<void> {
  let error;
  const promises: Promise<void>[] = [];

  const handlePromise = async (p: any) => {
    try {
      if (typeof p === "function") {
        p = p();
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
      devLog.errorOnce(e);
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

/** Asynchronous delay. Returns a promise that is resolved after some time. */
export function asyncDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
