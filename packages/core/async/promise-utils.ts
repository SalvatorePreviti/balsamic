export const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
  typeof value === "object" && value !== null && typeof (value as PromiseLike<T>).then === "function";

export const isPromise = <T>(value: unknown): value is Promise<T> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PromiseLike<T>).then === "function" &&
  typeof (value as Promise<T>).catch === "function";

export namespace asyncDelay {
  export type Timeout = ReturnType<typeof setTimeout>;

  export interface Options<T = void> {
    /** Signal used to abort the delay. */
    signal?: AbortSignal;

    value?: T;

    /**
     * Indicates whether the process should continue to run as long as the timer exists.
     * @default {true}
     */
    persistent?: boolean;
  }

  export interface AsyncDelayPromise<T> extends Promise<T> {
    timeout: Timeout | null;
    abort(): void;
  }
}
