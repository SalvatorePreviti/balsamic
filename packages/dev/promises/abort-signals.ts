import { AsyncLocalStorage } from "node:async_hooks";
import {
  setImmediate as timers_setImmediate,
  setTimeout as timers_setTimeout,
  setInterval as timers_setInterval,
} from "node:timers/promises";
import { devLog } from "../dev-log/dev-log";
import { noop } from "../utils/utils";
import { AbortError } from "./abort-error";
import type { TimerOptions } from "node:timers";
import { devEnv } from "../dev-env";
import { performance } from "node:perf_hooks";
import { millisecondsToString } from "../elapsed-time";
import type { UnsafeAny } from "../types";

let _abortSignalAsyncLocalStorage: AsyncLocalStorage<AbortSignal | undefined> | null = null;
const { defineProperty } = Reflect;

export type MaybeSignal = AbortController | AbortSignal | null | undefined;

export namespace abortSignals {
  export type AbortHandler = (this: AbortSignal, event: Event) => void;

  export type AsyncAbortHandler = <R = unknown>(this: AbortSignal, event: Event) => Promise<R>;

  export interface HasAbortMethod {
    abort(reason?: unknown | undefined): void;
  }

  export interface HasRejectMethod {
    reject(reason?: unknown | undefined): void;
  }

  export interface HasDisposeMethod {
    dispose(): void;
  }

  export interface HasCloseMethod {
    close(): void;
  }

  export type AddAbortHandlerArg =
    | abortSignals.AbortHandler
    | AbortController
    | abortSignals.HasAbortMethod
    | abortSignals.HasRejectMethod
    | abortSignals.HasDisposeMethod
    | abortSignals.HasCloseMethod;

  export type AddAbortAsyncHandlerArg = abortSignals.AsyncAbortHandler | AddAbortHandlerArg;
}

export const abortSignals = {
  isAbortError: AbortError.isAbortError,
  isAbortController,
  isAbortSignal,

  withAbortSignal,

  getSignal,
  getAbortReason,
  getAbortError,
  isAborted,
  rejectIfAborted,
  throwIfAborted,
  abort,

  addAbortHandler,
  addAsyncAbortHandler,
  removeAbortHandler,
  signalAddPendingPromise,
  signalAwaitPendingPromises,
  signalRemovePendingPromise,

  registerProcessTermination,

  setTimeout,
  setInterval,

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

    minimumNumberOfTimesASignelNeedsToBeRaisedToForceTermination: 1,

    ignoreRepeatedSignalsTimeoutMilliseconds: 100,
  },
};

/**
 * Executes a function sharing the given abort signal in an AsyncLocalStorage.
 * All functions exported in abortSignals are aware of this, and will use the signal passed in this function
 * when their signal parameter is unspecified or undefined.
 *
 * If promises are added with signalAddPendingPromise or addAsyncAbortHandler, you can call signalAwaitPendingPromises.
 */
function withAbortSignal<R>(signal: MaybeSignal, callback: () => R): R {
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
function isAborted(signal?: MaybeSignal | { aborted?: boolean }): boolean {
  const msignal = abortSignals.getSignal(signal as UnsafeAny);
  if (msignal) {
    return !!msignal.aborted;
  }
  return typeof signal === "object" && signal !== null && !!(signal as UnsafeAny).aborted;
}

/**
 * If the signal was aborted, throws an AbortError. If not, does nothing.
 */
async function rejectIfAborted(signal?: MaybeSignal): Promise<void> {
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    return timers_setImmediate(undefined, { signal });
  }
  return undefined;
}

/**
 * This implementation of throwIfAborted is far from perfect since it loses the stack trace of the abort call.
 */
function throwIfAborted(signal?: MaybeSignal): void | never {
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    throw new AbortError(undefined, { caller: throwIfAborted });
  }
}

/**
 * If a signal was aborted, returns an AbortError instance. Returns undefined if not abort.ed.
 */
function getAbortError(signal?: MaybeSignal): AbortError | undefined {
  signal = abortSignals.getSignal(signal);
  if (signal?.aborted) {
    return new AbortError(undefined, { caller: getAbortError });
  }
  return undefined;
}

/** Aborts the given abortController with a reason. */
function abort(
  abortController:
    | AbortController
    | abortSignals.HasAbortMethod
    | abortSignals.HasRejectMethod
    | abortSignals.HasDisposeMethod
    | abortSignals.HasCloseMethod,
  reason?: unknown,
): boolean {
  try {
    if (isAborted(abortController as UnsafeAny)) {
      return false;
    }
    if (reason === undefined) {
      reason = getAbortReason();
    }
    if (reason !== undefined) {
      const signal = "signal" in abortController ? abortController.signal : undefined;
      if (
        typeof signal === "object" &&
        signal !== null &&
        (signal as { reason?: unknown | undefined }).reason === undefined
      ) {
        defineProperty(signal, "reason", {
          value: reason,
          configurable: true,
          enumerable: true,
          writable: true,
        });
      }
    }

    if (typeof (abortController as abortSignals.HasAbortMethod).abort === "function") {
      (abortController as abortSignals.HasAbortMethod).abort(reason);
      return true;
    }

    if (typeof (abortController as abortSignals.HasRejectMethod).reject === "function") {
      (abortController as abortSignals.HasRejectMethod).reject(reason);
      return true;
    }

    if (typeof (abortController as abortSignals.HasDisposeMethod).dispose === "function") {
      (abortController as abortSignals.HasDisposeMethod).dispose();
      return true;
    }

    if (typeof (abortController as abortSignals.HasCloseMethod).close === "function") {
      (abortController as abortSignals.HasCloseMethod).close();
      return true;
    }
  } catch {}

  return false;
}

function getAbortReason<Reason = unknown>(signal?: MaybeSignal): Reason | undefined {
  if (AbortError.isAbortError(signal)) {
    return signal.reason as Reason;
  }
  signal = abortSignals.getSignal(signal);
  if (signal && signal.aborted) {
    return (signal as { reason?: Reason | undefined }).reason;
  }
  return undefined;
}

const _addAbortHandlerOptions: AddEventListenerOptions = { once: true, passive: true };
const _pendingPromisesBySignalMap = new WeakMap<AbortSignal, Promise<unknown>[]>();
const _abortHandlersRemap = new WeakMap<object, (this: AbortSignal, ev: Event) => UnsafeAny>();

/**
 * Removes an abort handler previously registered with addAbortHandler or addAsyncAbortHandler from a signal.
 */
function removeAbortHandler(
  signal: MaybeSignal,
  handler: abortSignals.AddAbortAsyncHandlerArg | abortSignals.AddAbortHandlerArg | null | undefined | false | void,
): void {
  signal = abortSignals.getSignal(signal);
  if (!signal || (typeof handler !== "object" && typeof handler !== "function") || handler === null) {
    return;
  }
  handler = _abortHandlersRemap.get(handler);
  if (typeof handler !== "function") {
    return;
  }
  signal.removeEventListener("abort", handler);
}

/**
 * Adds a new sync function to be executed on abort.
 * If already aborted, the function will be called straight away.
 * The function should not return a Promise, use addAsyncAbortHandler instead.
 *
 * @returns A function that when called removes the abort handler.
 * If the handler was not added, the function noop() will be returned.
 * You can check for equality with noop function to check if the handler was not added.
 */
function addAbortHandler(
  signal: MaybeSignal,
  handler: abortSignals.AddAbortHandlerArg | null | undefined | false | void,
): () => void {
  signal = abortSignals.getSignal(signal);
  if (!signal) {
    return noop;
  }

  let func: ((this: AbortSignal, ev: Event) => UnsafeAny) | undefined;
  if (typeof handler === "function") {
    func = handler;
  } else if (typeof handler === "object" && handler !== null) {
    func = _abortHandlersRemap.get(handler);
    if (func === undefined) {
      if (
        !(
          (!("abort" in handler) && !("reject" in handler) && !("dispose" in handler) && !("close" in handler)) ||
          abortSignals.isAborted(handler as UnsafeAny)
        )
      ) {
        const abortable = handler;
        func = function handleAbortSignal(this: AbortSignal) {
          abortSignals.abort(abortable, abortSignals.getAbortReason(this));
        };
        _abortHandlersRemap.set(handler, func);
      }
    }
  }
  if (func === noop || func === undefined) {
    return noop;
  }
  if (signal.aborted) {
    func.call(signal, new (global as unknown as { Event: { new (x: string): Event } }).Event("abort"));
    return noop;
  }
  signal.addEventListener("abort", func, _addAbortHandlerOptions);
  return () => {
    if (signal !== null) {
      (signal as AbortSignal).removeEventListener("abort", func!);
      signal = null;
      func = undefined;
    }
  };
}

/**
 * Adds a new asynchronous function to be executed on abort.
 * If already aborted, the function will be called straight away.
 * The promise will be added to the signal with `signalAddPendingPromise`.
 * User is responsible to await for those promises with `signalAwaitPendingPromises`.
 * Async errors will be ignored.
 *
 * @returns A function that when called removes the abort handler.
 * If the handler was not added, the function noop() will be returned.
 * You can check for equality with noop function to check if the handler was not added.
 */
function addAsyncAbortHandler(
  signal: MaybeSignal,
  handler: abortSignals.AddAbortAsyncHandlerArg | null | undefined | false | void,
): () => void {
  signal = abortSignals.getSignal(signal);
  if (!signal) {
    return noop;
  }

  if (typeof handler === "object" && handler !== null) {
    return abortSignals.addAbortHandler(signal, handler as UnsafeAny);
  }

  if (typeof handler !== "function") {
    return noop;
  }

  let ahandler = _abortHandlersRemap.get(handler);
  if (!ahandler) {
    ahandler = function asyncAbortHandler(this: AbortSignal, event: Event) {
      const result = (handler as Function).call(this, event);
      if (typeof result === "object" && result !== null && typeof (result as Promise<unknown>).then === "function") {
        abortSignals.signalAddPendingPromise(result);
      }
      return result;
    };
    _abortHandlersRemap.set(handler, ahandler);
  }

  return abortSignals.addAbortHandler(signal, ahandler);
}

/**
 * Adds a pending promise to an AbortSignal.
 * You can await all pending promises with awaitSignalPendingPromises.
 *
 * Note: Errors may be ignored!
 *
 * @returns A function that if called removes the added pending promise.
 */
function signalAddPendingPromise(
  signal: MaybeSignal | undefined,
  promise: Promise<unknown> | null | undefined | void,
): () => void {
  if (typeof promise !== "object" || promise === null || !promise.then) {
    return noop;
  }
  signal = abortSignals.getSignal(signal);
  if (!signal) {
    return noop;
  }

  let pendingPromises = _pendingPromisesBySignalMap.get(signal);

  const removePendingPromise = () => {
    if (pendingPromises) {
      const index = pendingPromises.indexOf(promise);
      if (index >= 0) {
        pendingPromises.splice(index, 1);
      }
      pendingPromises = undefined;
    }
  };

  if (!pendingPromises) {
    pendingPromises = [promise];
    _pendingPromisesBySignalMap.set(signal, pendingPromises);
  } else {
    pendingPromises.push(promise);
  }

  promise.then(removePendingPromise, removePendingPromise);

  return removePendingPromise;
}

/**
 * Removes a promise previously added with signalAddPendingPromise.
 */
function signalRemovePendingPromise(
  signal: MaybeSignal | undefined,
  promise: Promise<unknown> | null | undefined | void,
): boolean {
  signal = abortSignals.getSignal(signal);
  if (!signal || !promise) {
    return false;
  }
  const pendingPromises = _pendingPromisesBySignalMap.get(signal);
  if (!pendingPromises) {
    return false;
  }
  const index = pendingPromises.indexOf(promise);
  if (index < 0) {
    return false;
  }
  pendingPromises.splice(index, 1);
  return true;
}

/**
 * If an AbortSignal has some registered pending promises to flush,
 * this function await for them all, without throwing on error.
 *
 * You can add a pending promise to an AbortSignal with addSignalPendingPromise
 */
async function signalAwaitPendingPromises(signal?: MaybeSignal): Promise<void> {
  signal = abortSignals.getSignal(signal);
  const array = signal && _pendingPromisesBySignalMap.get(signal);
  if (!array) {
    return;
  }
  for (;;) {
    let item = array.pop();
    if (item === undefined) {
      await timers_setImmediate();
      item = array.pop();
      if (item === undefined) {
        break;
      }
    }
    try {
      await item;
    } catch {}
  }
}

const _registeredAbortControllers: AbortController[] = [];
const _signalsRaised = new Map<string, { counter: number; time: number }>();
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

  const now = performance.now();
  let state = _signalsRaised.get(signal);
  if (!state) {
    state = { counter: 0, time: now };
    _signalsRaised.set(signal, state);
  } else {
    if (now - state.time < abortSignals.processTerminationOptions.ignoreRepeatedSignalsTimeoutMilliseconds) {
      return; // Ignore, no enough time passed since the last signal
    }
    ++state.counter;
    state.time = now;
  }

  let delay = abortSignals.processTerminationOptions.processKillOnDoubleSignalsTimeout;
  if (!delay || !Number.isFinite(delay)) {
    delay = 0;
  }

  const shouldTerminate =
    state.counter >=
      abortSignals.processTerminationOptions.minimumNumberOfTimesASignelNeedsToBeRaisedToForceTermination &&
    delay > 0 &&
    !_terminating;

  if (abortSignals.processTerminationOptions.logSignals) {
    const title = devEnv.processTitle;
    devLog.log();
    devLog.hr("red");
    let msg = `😵 ABORT: ${title ? `${title}, ` : ""}${signal}`;
    if (state.counter > 0) {
      msg += ` +${state.counter}`;
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
    const title = devEnv.processTitle;
    global
      .setTimeout(() => {
        _unregisterHandlers(true);
        if (abortSignals.processTerminationOptions.logSignals) {
          devLog.logRedBright(`💀 ${title ? `${title}, ` : ""}process.exit(1) due to ${signal}`);
        }
        process.exit(1);
      }, delay)
      .unref();
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
    const title = devEnv.processTitle;
    devLog.log();
    devLog.hr("red");
    devLog.logException(`😵 ABORT: ${title ? `${title}, ` : ""}unhancled exception`, error);
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
    const title = devEnv.processTitle;
    devLog.log();
    devLog.hr("red");
    devLog.logException(`😵 ABORT: ${title ? `${title}, ` : ""}unhancled rejection`, error);
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
    _signalsRaised.set("process_exit", { counter: 0, time: 0 });
    if (abortSignals.processTerminationOptions.logProcessExitRequest) {
      const title = devEnv.processTitle;
      devLog.logException(title ? `😵 ${title},` : "😵", error, { abortErrorIsWarning: false, showStack: true });
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
    abort(reason?: unknown | undefined) {
      return abortSignals.abort(abortController, reason);
    },
  };

  return result;
}

/**
 * ```js
 * import {
 *   setTimeout,
 * } from 'timers/promises';
 *
 * const res = await setTimeout(100, 'result');
 *
 * console.log(res);  // Prints 'result'
 * ```
 * @param [delay=1] The number of milliseconds to wait before fulfilling the promise.
 * @param value A value with which the promise is fulfilled.
 */
function setTimeout<T = void>(
  delay?: number | undefined,
  value?: T | undefined,
  options?: TimerOptions | undefined,
): Promise<T> {
  return timers_setTimeout(delay, value, { ...options, signal: abortSignals.getSignal(options?.signal) });
}

/**
 * Returns an async iterator that generates values in an interval of `delay` ms.
 *
 * ```js
 * import {
 *   setInterval,
 * } from 'timers/promises';
 *
 * const interval = 100;
 * for await (const startTime of setInterval(interval, Date.now())) {
 *   const now = Date.now();
 *   console.log(now);
 *   if ((now - startTime) > 1000)
 *     break;
 * }
 * console.log(Date.now());
 * ```
 */
function setInterval<T = void>(
  delay?: number | undefined,
  value?: T | undefined,
  options?: TimerOptions | undefined,
): AsyncIterable<T> {
  return timers_setInterval(delay, value, { ...options, signal: abortSignals.getSignal(options?.signal) });
}
