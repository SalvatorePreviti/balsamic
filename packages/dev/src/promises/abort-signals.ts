import { AsyncLocalStorage } from "node:async_hooks";
import { setImmediate } from "node:timers/promises";
import { AbortError } from "./abort-error";

let _abortSignalAsyncLocalStorage: AsyncLocalStorage<AbortSignal | undefined> | null = null;
const { defineProperty } = Reflect;

export type MaybeSignal = AbortController | AbortSignal | null | undefined;

export const abortSignals = {
  isAbortError: AbortError.isAbortError,
  isAbortController,
  isAbortSignal,
  getSignal,
  getAbortReason,
  isAborted,
  rejectIfAborted,
  throwIfAborted,
  addAbortHandler,
  abort,
  run,
};

function run<R = void>(signal: MaybeSignal, callback: () => R): R {
  return (_abortSignalAsyncLocalStorage ?? (_abortSignalAsyncLocalStorage = new AsyncLocalStorage())).run(
    signal === null ? undefined : abortSignals.getSignal(signal),
    callback,
  );
}

function getSignal(signal?: MaybeSignal): AbortSignal | undefined {
  if (signal !== undefined) {
    if (isAbortSignal(signal)) {
      return signal;
    }
    signal = signal?.signal;
    if (isAbortSignal(signal)) {
      return signal;
    }
  }
  return signal === undefined ? _abortSignalAsyncLocalStorage?.getStore() : signal;
}

/** Returns true if the given value is an AbortSignal instance */
function isAbortSignal(signal: unknown): signal is AbortSignal {
  return (
    typeof signal === "object" &&
    signal !== null &&
    typeof (signal as AbortSignal).addEventListener === "function" &&
    typeof (signal as AbortSignal).aborted === "boolean"
  );
}

/** Returns true if the given value is an AbortController instance */
function isAbortController(controller: unknown): controller is AbortController {
  return (
    typeof controller === "object" &&
    controller !== null &&
    typeof (controller as AbortController).abort === "function" &&
    isAbortSignal((controller as AbortController).signal)
  );
}

/** Returns true if the given value is an aborted AbortSignal or AbortController */
function isAborted(signal?: MaybeSignal): boolean {
  signal = abortSignals.getSignal(signal);
  return !!signal && !!signal.aborted;
}

/**
 * If the signal was aborted, throws an AbortError. If not, does nothing.
 * Prefer rejectIfAborted to throwIfAborted until throwIfAborted is not implemented in AbortSignal in the next node versions.
 */
async function rejectIfAborted(signal?: MaybeSignal): Promise<void> {
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    return setImmediate(undefined, { signal });
  }
  return undefined;
}

/**
 * This implementation of throwIfAborted is far from perfect since it loses the stack trace of the abort call.
 * Prefer rejectIfAborted to throwIfAborted until throwIfAborted is not implemented in AbortSignal in the next node versions.
 */
function throwIfAborted(signal?: MaybeSignal): void | never {
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    throw new AbortError();
  }
}

/** Aborts the given abortController with a reason. */
function abort(abortController: AbortController, reason?: unknown): boolean {
  const signal = abortController.signal;
  if (signal.aborted) {
    return false;
  }

  if (reason !== undefined && (signal as { reason?: undefined }).reason === undefined) {
    defineProperty(signal, "reason", {
      value: reason,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }

  try {
    abortController.abort(reason);
  } catch {
    return false;
  }

  return true;
}

function getAbortReason(signal?: MaybeSignal): unknown | undefined {
  if (AbortError.isAbortError(signal)) {
    return signal.reason;
  }
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    return (signal as { reason?: unknown }).reason;
  }
  return undefined;
}

/**
 * Adds a new function to execute on abort.
 * If already aborted, the function will be called straight away.
 * The function should not return a Promise.
 */
function addAbortHandler(signal: MaybeSignal, fn: (() => void) | null | undefined | false): void {
  signal = abortSignals.getSignal(signal);
  if (!signal || typeof fn !== "function") {
    return;
  }
  if (signal.aborted) {
    fn();
  } else {
    signal.addEventListener("abort", () => fn(), { once: true });
  }
}
