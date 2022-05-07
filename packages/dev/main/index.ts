import path from "path";
import { fileURLToPath } from "url";
import { devEnv } from "../dev-env";
import { devError } from "../dev-error";
import { devLog } from "../dev-log";
import { stripExtension } from "../path";
import { AbortError } from "../promises/abort-error";
import { noop, millisecondsToString } from "../utils/utils";
import type { IntervalType, TimeoutType } from "../types";

let _logProcessTimeInitialized = 0;
let _devErrorHandlingInitialized = 0;

let _mainProcessRefCounter = 0;
let _mainProcessRefUpdate = false;
let _mainProcessRefInterval: IntervalType | null = null;

let _exitTimeoutTimer: TimeoutType | null = null;
let _exitTerminatingTimer: TimeoutType | null = null;
let _exitTimeoutMilliseconds = 5000;
let _exitTimeoutExitCode = 2;

let _ignoredWarnings: Set<string> | null = null;
let _unhandledErrorsLogged: WeakSet<{}> | null = null;

export enum Main {}

export namespace Main {
  /** Prints process information */
  export function printProcessBanner() {
    const processTitle = devEnv.getProcessTitle();
    if (processTitle) {
      devLog.log(`${devLog.colors.blueBright("\n⬢")} ${devLog.colors.rgb(100, 200, 255)(processTitle)}\n`);
    }
  }

  /** Attach an handler that will log process duration when the process terminates. */
  export function initProcessTime(): () => void {
    if (++_logProcessTimeInitialized === 1) {
      process.on("exit", _processTimeExit);
    }
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        initErrorHandling.remove();
      }
    };
  }

  initProcessTime.remove = function initProcessTime_remove() {
    if (_logProcessTimeInitialized > 0 && --_logProcessTimeInitialized === 0) {
      process.once("exit", _processTimeExit);
    }
  };

  /** Attach unhandledRejection and uncaughtException handlers for logging and process.exitCode */
  export function initErrorHandling(): () => void {
    if (++_devErrorHandlingInitialized === 1) {
      process.on("unhandledRejection", _handleUnhandledRejection);
      process.on("uncaughtException", _handleUncaughtException);

      if (!process.hasUncaughtExceptionCaptureCallback()) {
        try {
          process.setUncaughtExceptionCaptureCallback(_handleUncaughtException);
        } catch (_) {}
      }

      initProcessTime();
    }
    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        initErrorHandling.remove();
      }
    };
  }

  initErrorHandling.remove = function initErrorHandling_remove() {
    if (_devErrorHandlingInitialized > 0 && --_devErrorHandlingInitialized === 0) {
      process.off("unhandledRejection", _handleUnhandledRejection);
      process.off("uncaughtException", _handleUncaughtException);
      initProcessTime.remove();
    }
  };

  export namespace processExitTimeout {
    export interface Options {
      milliseconds?: number | undefined;
      exitCode?: number | undefined;
    }
  }

  /**
   * Ensures that the application terminates with a timer, in case some service did hang.
   * Returns a cancellation object
   */
  export function processExitTimeout(options?: processExitTimeout.Options): () => void {
    if (_exitTerminatingTimer) {
      clearTimeout(_exitTerminatingTimer);
      _exitTerminatingTimer = null;
    }
    if (_exitTimeoutTimer) {
      clearTimeout(_exitTimeoutTimer);
      _exitTimeoutTimer = null;
    }
    if (options) {
      const { milliseconds, exitCode } = options;
      if (milliseconds !== undefined) {
        _exitTimeoutMilliseconds = milliseconds;
      }
      if (exitCode !== undefined) {
        _exitTimeoutExitCode = exitCode;
      }
    }
    if (_exitTimeoutMilliseconds > 500) {
      setTimeout(_processExitTimeOutStarted, 350).unref();
    }
    _exitTimeoutTimer = setTimeout(_processExitTimeoutReached, _exitTimeoutMilliseconds).unref();
    return processExitTimeout.remove;
  }

  processExitTimeout.remove = function processExitTimeout_remove() {
    if (_exitTerminatingTimer) {
      clearTimeout(_exitTerminatingTimer);
      _exitTerminatingTimer = null;
    }
    if (_exitTimeoutTimer) {
      clearTimeout(_exitTimeoutTimer);
      _exitTimeoutTimer = null;
    }
  };

  /** Handler for unhandled rejections (unhandled promise) */
  export function handleUnhandledRejection(error: unknown): void {
    if (_unhandledErrorsLoggedOnce(error)) {
      devLog.log();
      devLog.logException("Unhandled rejection", error, { showStack: "once" });
    }
  }

  /** Handler for unhandled error */
  export function handleUncaughtException(error: unknown): void {
    if (!process.exitCode && (!AbortError.isAbortError(error) || error.isOk !== true)) {
      process.exitCode =
        error instanceof Error && typeof error.exitCode === "number" && error.exitCode ? error.exitCode : 1;
    }
    if (_unhandledErrorsLoggedOnce(error)) {
      devLog.log();
      devLog.logException("Uncaught", error, { showStack: "once", abortErrorIsWarning: false });
    }
  }

  /** Emits an unhandled error and logs it properly */
  export function emitUncaughtException(cause: unknown) {
    const error = devError(cause, Main.emitUncaughtException);
    try {
      if (process.listenerCount("uncaughtException") === 0) {
        process.once("uncaughtException", Main.handleUncaughtException);
      }
      process.emit("uncaughtException", error);
    } catch (emitError) {
      devLog.error(emitError);
      try {
        Main.handleUncaughtException(error);
      } catch (_) {}
    }
  }

  /** Allow to ignore a warning emitted by NodeJS, so it does not get logged. */
  export function ignoreProcessWarning(name: string | string[], value = true): void {
    if (value) {
      if (!_ignoredWarnings) {
        _ignoredWarnings = _initIgnoredWarnings();
      }
      if (Array.isArray(name)) {
        for (const s of name) {
          _ignoredWarnings.add(s);
        }
      } else {
        _ignoredWarnings.add(name);
      }
    } else if (_ignoredWarnings) {
      if (Array.isArray(name)) {
        for (const s of name) {
          _ignoredWarnings.delete(s);
        }
      } else {
        _ignoredWarnings.delete(name);
      }
    }
  }

  ignoreProcessWarning.add = function ignoreProcessWarning_add(name: string | string[]) {
    ignoreProcessWarning(name, true);
  };

  ignoreProcessWarning.delete = function ignoreProcessWarning_delete(name: string | string[]) {
    ignoreProcessWarning(name, false);
  };

  /** True if a warning was ignored using devError.ignoreProcessWarning function */
  ignoreProcessWarning.has = function ignoreProcessWarning_has(name: string) {
    return _ignoredWarnings !== null && _ignoredWarnings.has(name);
  };

  ignoreProcessWarning.clear = function ignoreProcessWarning_clear() {
    if (_ignoredWarnings) {
      _ignoredWarnings.clear();
    }
  };

  /**
   * Keeps the main process alive, also if there are no pending async operations.
   * Returns a function that if called decrements once the counter or references to the main process.
   * @returns A function that removes this reference.
   */
  export function ref(): () => void {
    if (++_mainProcessRefCounter === 1 && !_mainProcessRefUpdate) {
      _mainProcessRefUpdate = true;
      setImmediate(_mainProcessRefDoUpdate);
    }
    return Main.unref.once();
  }

  /** Opposite of ref() */
  export function unref(): void {
    if (_mainProcessRefCounter > 0 && --_mainProcessRefCounter === 0 && !_mainProcessRefUpdate) {
      _mainProcessRefUpdate = true;
      setImmediate(_mainProcessRefDoUpdate);
    }
  }

  unref.once = function unref_once(): () => void {
    let removed = false;
    return (): void => {
      if (!removed) {
        removed = true;
        Main.unref();
      }
    };
  };

  /** Gets the number of references held */
  ref.count = function ref_count() {
    return _mainProcessRefCounter;
  };

  /** Prevent node to exit while a promise is running */
  ref.wrapPromise = function ref_wrapPromise<T>(promise: Promise<T>): Promise<T> {
    const _unref = Main.ref();
    return Promise.resolve(promise).finally(_unref);
  };

  ref.wrapAsyncFunction = function ref_wrapAsyncFunction<T>(fn: () => Promise<T>): () => Promise<T> {
    return (): Promise<T> => {
      try {
        return Main.ref.wrapPromise(fn());
      } catch (error) {
        return Promise.reject(error);
      }
    };
  };
}

export interface DevRunMainOptions<T = unknown> {
  /**
   * If non zero, invokes process.exit(2) after the specific time if the application does not terminate.
   * Useful to make a script terminate also if there are pending asynchronous operations.
   */
  processExitTimeout?: number | boolean | undefined | null;

  printProcessBanner?: boolean | undefined;

  initErrorHandling?: boolean | undefined;

  ignoreProcessWarnings?: string[] | undefined | null;

  /** Function to be executed at the end */
  onTerminated?: ((result: Error | T) => void | Promise<void>) | null | undefined | false;
}

/** Top level run of functions and promises */
export function devRunMain<T = unknown>(
  main: { exports: () => T | Promise<T> } | (() => T | Promise<T>) | Promise<T> | T,
  processTitle?: string | undefined,
  options?: DevRunMainOptions<T> | undefined,
): Promise<T | Error>;

export function devRunMain<T extends null | false | undefined>(
  main: T,
  processTitle?: string | undefined,
  options?: DevRunMainOptions<T> | undefined,
): Promise<T>;

export function devRunMain<T = unknown>(
  main: any,
  processTitle?: string | undefined,
  options: DevRunMainOptions<T> | undefined = {},
): Promise<T | Error> {
  const handledErrors = new Map<unknown, Error>();

  if (main === false || main === undefined || main === null) {
    return Promise.resolve(main);
  }

  const devRunMainError = (input: unknown): Error => {
    try {
      let error = handledErrors.get(input);
      if (error === undefined) {
        error = devError(input, devRunMainError);
        handledErrors.set(input, error);
        Main.handleUncaughtException(error);
      }
      return error;
    } catch {}
    return input as any;
  };

  let result: any;

  const unref = Main.ref();
  try {
    const initErrorHandling = options.initErrorHandling;
    if (initErrorHandling === undefined || initErrorHandling) {
      Main.initErrorHandling();
    }

    if (options.ignoreProcessWarnings) {
      Main.ignoreProcessWarning(options.ignoreProcessWarnings);
    }

    if (processTitle) {
      devEnv.setProcessTitle(processTitle);
    } else if (typeof main === "object" && main !== null && !devEnv.hasProcessTitle()) {
      devEnv.setProcessTitle(main as any);
    }

    const printProcessBanner = options.printProcessBanner;
    if (printProcessBanner === undefined || printProcessBanner) {
      Main.printProcessBanner();
    }

    if (main !== null && typeof main === "object") {
      if ("exports" in main) {
        main = main.exports;
      }
    }

    result = typeof main === "function" ? (main as any)() : main;
  } catch (error) {
    result = devRunMainError(error);
  } finally {
    unref();
  }

  let terminated = false;
  const unrefAsync = Main.ref();

  const onTerminated = async (ret: T | Error) => {
    ret = ret instanceof Error ? devRunMainError(ret) : ret;
    if (terminated) {
      return ret;
    }
    terminated = true;
    if (options.processExitTimeout) {
      try {
        Main.processExitTimeout({
          milliseconds: options.processExitTimeout === true ? undefined : options.processExitTimeout,
        });
      } catch {}
    }
    if (typeof options.onTerminated === "function") {
      await options.onTerminated(ret);
    }
    return ret;
  };

  return Promise.resolve(result)
    .then(onTerminated)
    .catch((error) => onTerminated(devRunMainError(error)))
    .finally(unrefAsync);
}

/** Returns true if the given module (filename, module object, import.meta) is the main module running in NodeJS */
export function isMainModule(
  module:
    | string
    | URL
    | Partial<Readonly<NodeModule>>
    | { url?: string | undefined }
    | { filename?: string | undefined }
    | { href?: string | undefined }
    | false
    | null
    | undefined,
) {
  if (!module) {
    return false;
  }
  if (process.mainModule === module || require.main === module) {
    return true;
  }
  if (typeof module === "object") {
    module = (module as any).url || (module as any).href || (module as any).filename || (module as any).id;
  }
  if (typeof module !== "string" || !module.length) {
    return false;
  }
  const argv1 = process.argv[1] || "";
  if (/^file:\/\//i.test(module)) {
    if (argv1 === module) {
      return true;
    }
    try {
      module = path.resolve(fileURLToPath(module));
    } catch (_) {}
  }
  const scriptPath = path.resolve(argv1);
  return module === scriptPath || stripExtension(module) === scriptPath;
}

function _unhandledErrorsLoggedOnce(value: unknown): boolean {
  if (typeof value === "object" && value !== null) {
    try {
      if (!_unhandledErrorsLogged) {
        _unhandledErrorsLogged = new WeakSet();
      }
      if (_unhandledErrorsLogged.has(value)) {
        return false;
      }
      _unhandledErrorsLogged.add(value);
    } catch {}
  }
  return true;
}

function _mainProcessRefDoUpdate() {
  _mainProcessRefUpdate = false;
  if (_mainProcessRefCounter > 0 && _mainProcessRefInterval === null) {
    _mainProcessRefInterval = setInterval(noop, 0x7fffffff);
  } else if (_mainProcessRefCounter <= 0 && _mainProcessRefInterval !== null) {
    clearInterval(_mainProcessRefInterval);
  }
}

function _handleUncaughtException(error: any) {
  return Main.handleUncaughtException(error);
}

function _handleUnhandledRejection(error: any) {
  return Main.handleUnhandledRejection(error);
}

function _processTimeExit() {
  try {
    const elapsed = millisecondsToString(process.uptime() * 1000);
    const exitCode = process.exitCode;
    if (exitCode) {
      devLog.log(
        devLog.colors.redBright(
          `\n😡 ${devEnv.getProcessTitle()} ${devLog.colors.redBright.bold.underline(
            "FAILED",
          )} in ${elapsed}. exitCode: ${exitCode}\n`,
        ),
      );
    } else {
      devLog.log(
        devLog.colors.greenBright(
          `\n✅ ${devEnv.getProcessTitle()} ${devLog.colors.bold("OK")} ${devLog.colors.green(`in ${elapsed}`)}\n`,
        ),
      );
    }

    process.off("exit", _processTimeExit);
  } catch {}
}

function _initIgnoredWarnings(): Set<string> {
  const _emitWarning = process.emitWarning;

  const emitWarning = (warning: string | Error, a: any, b?: any | undefined): void => {
    if (typeof a === "object" && a !== null) {
      a = { ...a, ctor: a.ctor || emitWarning };
      if (
        (a.type !== undefined && Main.ignoreProcessWarning.has?.(a.type)) ||
        (a.code !== undefined && Main.ignoreProcessWarning.has?.(a.code))
      ) {
        return;
      }
    }
    if (a === _emitWarning) {
      a = emitWarning;
    } else if (b === _emitWarning) {
      b = emitWarning;
    } else if (typeof a !== "function" && !b) {
      if (a === undefined) {
        a = emitWarning;
      } else {
        b = emitWarning;
      }
    }
    if (typeof a === "string" && Main.ignoreProcessWarning.has?.(a)) {
      return;
    }
    _emitWarning(warning, a, b);
  };
  process.emitWarning = emitWarning;

  return new Set();
}

function _processExitTimeoutReached() {
  const code = process.exitCode || _exitTimeoutExitCode || 2;
  try {
    devLog.error();
    devLog.error(
      `💀 Process exit timeout of ${millisecondsToString(_exitTimeoutMilliseconds)} reached. exitCode:${code}`,
    );
  } finally {
    // eslint-disable-next-line no-process-exit
    process.exit(code);
  }
}

function _processExitTimeOutStarted() {
  _exitTerminatingTimer = null;
  try {
    const title = devEnv.getProcessTitle();
    devLog.warn();
    if (title) {
      devLog.warn(title, "terminating...");
    } else {
      devLog.warn("terminating...");
    }
  } catch {}
}
