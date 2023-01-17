import { devError } from "../dev-error";
import type { UnsafeAny } from "../types";
import { abortSignals } from "./abort-signals";

export function isThenable<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && (typeof value as UnsafeAny).then === "function";
}

export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (typeof value as UnsafeAny).then === "function" &&
    (typeof value as UnsafeAny).catch === "function"
  );
}

/** Runs lists of functions or promises in sequence */
export async function runSequential(...functionsOrPromises: unknown[]): Promise<void> {
  for (let p of functionsOrPromises) {
    if (typeof p === "function") {
      const signal = abortSignals.getSignal();
      if (signal && signal.aborted) {
        abortSignals.throwIfAborted(signal);
      }
      p = p();
    }
    if (!p || typeof p === "number" || typeof p === "boolean" || typeof p === "string") {
      continue;
    }
    if (typeof (p as UnsafeAny).then === "function") {
      p = await (p as UnsafeAny);
    }
    if (typeof p === "object" && p !== null && Symbol.iterator in (p as UnsafeAny)) {
      await runSequential(...(p as UnsafeAny));
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

  let error: UnsafeAny;
  const handlePromise = async (p: UnsafeAny) => {
    try {
      if (typeof p === "function") {
        const signal = abortSignals.getSignal();
        if (signal && signal.aborted) {
          abortSignals.throwIfAborted(signal);
        }
        p = error === undefined && p();
      }
      if (!p || typeof p === "number" || typeof p === "boolean" || typeof p === "string") {
        return undefined;
      }
      if (typeof p.then === "function") {
        p = await p;
      }
      if (typeof p === "object" && p !== null && Symbol.iterator in p) {
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
