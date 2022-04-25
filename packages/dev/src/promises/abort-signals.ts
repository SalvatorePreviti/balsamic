import { AsyncLocalStorage } from "node:async_hooks";
import { setImmediate } from "node:timers/promises";
import { devLog } from "../dev-log";
import { millisecondsToString } from "../utils";
import { AbortError } from "./abort-error";

let _abortSignalAsyncLocalStorage: AsyncLocalStorage<AbortSignal | undefined> | null = null;
const { defineProperty } = Reflect;

export type MaybeSignal = AbortController | AbortSignal | null | undefined;

export namespace abortSignals {
  export type AbortHandler = <Reason = unknown>(reason: Reason) => void;
}

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

  registerProcessTermination,

  /** Global options for registerProcessTermination. */
  processTerminationOptions: {
    /** True if signals should be logged */
    logSignals: true,

    /** True if unhandled exceptions should be logged. */
    logUnhandledExceptions: true,

    /** If preventProcessExit is true and logProcessExitRequest is true, process.exit requests will be logged as well. */
    logProcessExitRequest: false,

    /** True if unhandled rejections should be handled as well. Default is false. */
    handleUnhandledRejections: false,

    /**
     * Number of milliseconds to wait after a signal is received twice before process.exit(1) is called.
     * 0, null, undefined means infinity.
     */
    processKillOnDoubleSignalsTimeout: 2000 as number | undefined | null | false,

    /**
     * If true, process.exit will be blocked and instead the abortController will be aborted.
     * Whilst pretty invasive, this might be useful when some third party library enjoy to randomly raise a process.exit for no reason.
     */
    preventProcessExit: false,

    /**
     * If true, ServicesRunner.registerProcessTerminationDuringRun option will be true by default.
     * Replaces standard SIGINT, SIGTERM, SIGBREAK, SIGHUP and uncaughtException handlers with abortController.abort during ServicesRunner.run function.
     */
    registerProcessTerminationDuringRun: false,
  },
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
function addAbortHandler(signal: MaybeSignal, fn: abortSignals.AbortHandler | null | undefined | false): void {
  signal = abortSignals.getSignal(signal);
  if (!signal || typeof fn !== "function") {
    return;
  }
  if (signal.aborted) {
    fn(abortSignals.getAbortReason(signal));
  } else {
    signal.addEventListener("abort", () => fn(abortSignals.getAbortReason(signal)), { once: true });
  }
}

const _registeredAbortControllers: AbortController[] = [];
const _signalsRaised = new Map<string, number>();
let _terminating: string | null = null;
let _registrationsCount = 0;
let _overriddenProcessExit: typeof process.exit | null = null;

function signalHandler(signal: NodeJS.Signals) {
  if (!signal) {
    signal = "SIGTERM";
  }

  while (_registeredAbortControllers.length > 0) {
    const abortController = _registeredAbortControllers.pop();
    if (abortController) {
      abortSignals.abort(abortController, signal);
    }
  }

  const raisedCount = _signalsRaised.get(signal) || 0;
  _signalsRaised.set(signal, raisedCount + 1);

  let delay = abortSignals.processTerminationOptions.processKillOnDoubleSignalsTimeout;
  if (!delay || !Number.isFinite(delay)) {
    delay = 0;
  }

  const shouldTerminate = raisedCount > 0 && delay > 0 && !_terminating;

  if (abortSignals.processTerminationOptions.logSignals) {
    devLog.log();
    devLog.hr("red");
    let msg = `😵 ABORT: ${signal}`;
    if (raisedCount > 0) {
      msg += ` +${raisedCount}`;
    }
    if (shouldTerminate) {
      msg += ` - process will be killed in ${millisecondsToString(delay)}`;
    }
    devLog.logRedBright(msg);
    devLog.hr("red");
    devLog.log();
  }

  if (shouldTerminate) {
    _unregisterHandlers(true);
    _terminating = signal;
    setTimeout(() => {
      _unregisterHandlers(true);
      if (abortSignals.processTerminationOptions.logSignals) {
        devLog.logRedBright(`💀 process.exit(1) due to ${signal}`);
      }
      process.exit(1);
    }, delay).unref();
  }
}

function uncaughtExceptionHandler(error: Error) {
  while (_registeredAbortControllers.length > 0) {
    const abortController = _registeredAbortControllers.pop();
    if (abortController) {
      abortSignals.abort(abortController, error);
    }
  }
  if (abortSignals.processTerminationOptions.logUnhandledExceptions && !AbortError.isAbortError(error)) {
    devLog.log();
    devLog.hr("red");
    devLog.logException(`😵 ABORT: unhancled exception`, error);
    devLog.hr("red");
    devLog.log();
  }
}

function unhandledRejectionHandler(error: Error) {
  while (_registeredAbortControllers.length > 0) {
    const abortController = _registeredAbortControllers.pop();
    if (abortController) {
      abortSignals.abort(abortController, error);
    }
  }
  if (abortSignals.processTerminationOptions.logUnhandledExceptions && !AbortError.isAbortError(error)) {
    devLog.log();
    devLog.hr("red");
    devLog.logException(`😵 ABORT: unhancled rejection`, error);
    devLog.hr("red");
    devLog.log();
  }
}

function _unregisterHandlers(forced: boolean = false) {
  if (forced && _registrationsCount) {
    _registrationsCount = 1;
  }

  if (_registrationsCount > 1) {
    --_registrationsCount;
    return;
  }

  _registrationsCount = 0;
  process.off("SIGINT", signalHandler);
  process.off("SIGTERM", signalHandler);
  process.off("SIGBREAK", signalHandler);
  process.off("SIGHUP", signalHandler);
  process.off("uncaughtException", uncaughtExceptionHandler);
  process.off("unhandledRejection", uncaughtExceptionHandler);
  if (!_terminating) {
    _signalsRaised.clear();
  }

  if (_overriddenProcessExit) {
    defineProperty(process, "exit", {
      value: _overriddenProcessExit,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    _overriddenProcessExit = null;
  }
}

function _registerHandlers() {
  if (_terminating) {
    return;
  }
  if (_registrationsCount > 0) {
    ++_registrationsCount;
    return;
  }

  _registrationsCount = 1;
  process.on("SIGINT", signalHandler);
  process.on("SIGTERM", signalHandler);
  process.on("SIGBREAK", signalHandler);
  process.on("SIGHUP", signalHandler);
  process.on("uncaughtException", uncaughtExceptionHandler);
  if (abortSignals.processTerminationOptions.handleUnhandledRejections) {
    process.on("unhandledRejection", unhandledRejectionHandler);
  }

  if (!_overriddenProcessExit) {
    _overriddenProcessExit = process.exit;
    defineProperty(process, "exit", { value: processAbort, configurable: true, enumerable: true, writable: true });
  }
}

function processAbort(code: number | undefined = process.exitCode) {
  const error = code === 0 ? new AbortError.AbortOk("process.exit(0)") : new AbortError(`process.exit(${code}')`);

  if (!_signalsRaised.has("process_exit")) {
    _signalsRaised.set("process_exit", 1);
    if (abortSignals.processTerminationOptions.logProcessExitRequest) {
      devLog.logException("😵", error, { abortErrorIsWarning: false, showStack: true });
    }
  }

  while (_registeredAbortControllers.length > 0) {
    const abortController = _registeredAbortControllers.pop();
    if (abortController) {
      abortSignals.abort(abortController, error);
    }
  }
}

/**
 * Replaces standard SIGINT, SIGTERM, SIGBREAK, SIGHUP and uncaughtException handlers with abortController.abort
 */
function registerProcessTermination(abortController: AbortController) {
  const abortSignal = abortController.signal;

  if (!abortSignal.aborted) {
    if (_terminating) {
      abortSignals.abort(abortController, _terminating);
    } else if (_registeredAbortControllers.indexOf(abortController) < 0) {
      _registeredAbortControllers.push(abortController);
    }
  }

  let registered = true;
  _registerHandlers();

  const result = {
    signal: abortController.signal,
    get registered() {
      return registered;
    },
    unregister() {
      if (!registered) {
        return false;
      }
      registered = false;
      _unregisterHandlers();
      return true;
    },
    abort(reason?: unknown) {
      return abortSignals.abort(abortController, reason);
    },
  };

  return result;
}
