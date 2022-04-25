import { devError } from "../dev-error";
import { abortSignals } from "./abort-signals";

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
