import { AsyncLocalStorage } from "async_hooks";
import { AbortError } from "./abort-error";

let _abortSignalAsyncLocalStorage: AsyncLocalStorage<AbortSignal | undefined> | null = null;
const _signalsAbortErrorWeakMap = new WeakMap<AbortSignal, AbortError | undefined>();
const { defineProperty } = Reflect;

export type MaybeSignal = AbortController | AbortSignal | null | undefined;

export const withAbortSignal = {
  isAbortError: AbortError.isAbortError,
  isAbortController,
  isAbortSignal,
  getOrCreateAbortError,
  getSignal,
  isAborted,
  throwIfAborted,
  getAbortError,
  getAbortReason,
  abort,
  run,
};

function run<R = void>(signal: MaybeSignal, callback: () => R): R {
  return (_abortSignalAsyncLocalStorage ?? (_abortSignalAsyncLocalStorage = new AsyncLocalStorage())).run(
    signal === null ? undefined : withAbortSignal.getSignal(signal),
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
  signal = withAbortSignal.getSignal(signal);
  return !!signal && !!signal.aborted;
}

/** If the signal was aborted, throws an AbortError. If not, does nothing. */
function throwIfAborted(signal?: MaybeSignal, options?: AbortError.Options): void | never {
  signal = withAbortSignal.getSignal(signal);
  if (signal?.aborted) {
    if (!options || !options.caller) {
      options = { ...options, caller: throwIfAborted };
    }
    throw withAbortSignal.getOrCreateAbortError(signal, options);
  }
}

/** Gets or create an AbortError for the given signal. It returns the instance also if not yet aborted. */
function getOrCreateAbortError(signal?: MaybeSignal, options?: AbortError.Options) {
  signal = withAbortSignal.getSignal(signal);

  if (signal) {
    let error = _signalsAbortErrorWeakMap.get(signal);
    if (error) {
      return error;
    }
    const reason = (signal as { reason?: unknown }).reason;
    if (AbortError.isAbortError(reason)) {
      _signalsAbortErrorWeakMap.set(signal, reason);
      return reason;
    }

    const abortErrorOptions: AbortError.Options = { caller: options?.caller || getOrCreateAbortError };
    if (options?.cause) {
      abortErrorOptions.cause = options.cause;
    } else if (reason instanceof Error) {
      abortErrorOptions.cause = reason;
    }

    error = new AbortError(reason ? `${reason}` : undefined, abortErrorOptions);

    if (reason) {
      defineProperty(error, "reason", { value: reason, configurable: true, enumerable: true, writable: true });
    }

    _signalsAbortErrorWeakMap.set(signal, error);
    return error;
  }

  return new AbortError(undefined, { cause: options?.cause, caller: options?.caller || getOrCreateAbortError });
}

/** If a signal is aborted, it returns the AbortError instance. */
function getAbortError(signal?: MaybeSignal | Error, options?: AbortError.Options): AbortError | undefined {
  if (signal instanceof Error) {
    return signal as AbortError;
  }
  signal = withAbortSignal.getSignal(signal);
  if (signal && signal.aborted) {
    if (!options || !options.caller) {
      options = { ...options, caller: abort };
    }
    return withAbortSignal.getOrCreateAbortError(signal, options);
  }
  return undefined;
}

getOrCreateAbortError.hasAbortError = function hasAbortError(signal?: MaybeSignal): boolean {
  signal = withAbortSignal.getSignal(signal);
  return !!signal && _signalsAbortErrorWeakMap.has(signal);
};

/** If a signal is aborted, it returns the abort reason. Returns undefined otherwise. */
function getAbortReason(signal?: MaybeSignal | Error): unknown {
  if (signal instanceof Error) {
    return signal.reason;
  }
  signal = withAbortSignal.getSignal(signal);
  return signal && signal.aborted ? (signal as { reason?: unknown }).reason : undefined;
}

/** Aborts the given abortController with a reason. */
function abort(abortController: AbortController, reason?: unknown, options?: AbortError.Options): boolean {
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

  if (!options || !options.caller) {
    options = { ...options, caller: abort };
  }

  const abortError = withAbortSignal.getOrCreateAbortError(signal, options);
  if (reason === undefined) {
    reason = abortError;
  }

  if (reason === undefined) {
    reason = abortError;
  }

  if ((signal as { reason?: undefined }).reason === undefined) {
    defineProperty(signal, "reason", {
      value: abortError,
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
