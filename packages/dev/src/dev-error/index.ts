import { devLog } from "../dev-log";
import { AbortError } from "../promises/abort-error";

let _devErrorHandlingInitialized = false;
let _ignoredWarnings: Set<string> | null = null;

const _unhandledErrorsLogged = new WeakSet();

const _unhandledErrorsLoggedOnce = (value: unknown): boolean => {
  if (typeof value === "object" && value !== null) {
    try {
      if (_unhandledErrorsLogged.has(value)) {
        return false;
      }
      _unhandledErrorsLogged.add(value);
    } catch {}
  }
  return true;
};

const { defineProperty } = Reflect;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError>(error: TError): TError extends Error ? TError : Error;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError>(error: TError, caller: Function): TError extends Error ? TError : Error;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError, TFields extends {}>(
  error: TError,
  fields: TFields,
  caller?: Function,
): (TError extends Error ? TError : Error) & TFields;

/** Fixes an error, the return value is always an Error instance */
export function devError(error?: any, a?: any, b?: any) {
  try {
    if (!(error instanceof Error)) {
      if (typeof error === "object" && error !== null) {
        error = Object.assign(new Error(error.message || "Unknown error"), error);
      } else {
        error = new Error((error as any) || "Unknown error");
      }
      if (!("stack" in error)) {
        Error.captureStackTrace(error, typeof b === "function" ? b : typeof a === "function" ? a : devError);
      }
    }

    if ((typeof a === "string" || a instanceof Error) && a !== error) {
      error.cause = a;
    } else if (typeof a === "object" && a !== null) {
      Object.assign(error, a);
    }

    // Hide some unuseful properties

    hideProperty(error, "showStack");
    hideProperty(error, "codeFrame");
    hideProperty(error, "watchFiles");

    if (error.isAxiosError) {
      hideProperty(error, "response");
      hideProperty(error, "request");
      hideProperty(error, "config");
    }
  } catch {}

  return error;
}

/** Attach unhandledRejection and uncaughtException handlers for logging and process.exitCode */
devError.initErrorHandling = function initErrorHandling() {
  if (_devErrorHandlingInitialized) {
    return false;
  }
  _devErrorHandlingInitialized = true;

  const handleUncaughtException = (error: any) => devError.handleUncaughtException(error);
  const handleUnhandledRejection = (error: any) => devError.handleUnhandledRejection(error);

  process.on("unhandledRejection", handleUnhandledRejection);
  process.on("uncaughtException", handleUncaughtException);

  if (!process.hasUncaughtExceptionCaptureCallback()) {
    try {
      process.setUncaughtExceptionCaptureCallback(handleUncaughtException);
    } catch (_) {}
  }

  devLog.initProcessTime();

  return true;
};

/** Handler for unhandled rejections (unhandled promise) */
devError.handleUnhandledRejection = function handleUnhandledRejection(error: unknown) {
  if (_unhandledErrorsLoggedOnce(error)) {
    devLog.logException("Unhandled rejection", error, { showStack: "once" });
  }
};

/** Handler for unhandled error */
devError.handleUncaughtException = function handleUncaughtException(error: unknown) {
  if (!process.exitCode && (!AbortError.isAbortError(error) || error.isOk !== true)) {
    process.exitCode =
      error instanceof Error && typeof error.exitCode === "number" && error.exitCode ? error.exitCode : 1;
  }
  if (_unhandledErrorsLoggedOnce(error)) {
    devLog.logException("Uncaught", error, { showStack: "once" });
  }
};

/** Emits an unhandled error and logs it properly */
devError.emitUncaughtException = (cause: unknown) => {
  const error = devError(cause, devError.emitUncaughtException);
  try {
    if (process.listenerCount("uncaughtException") === 0) {
      process.once("uncaughtException", devError.handleUncaughtException);
    }
    process.emit("uncaughtException", error);
  } catch (emitError) {
    devLog.error(emitError);
    try {
      devError.handleUncaughtException(error);
    } catch (_) {}
  }
};

/** Allow to ignore a warning emitted by NodeJS, so it does not get logged. */
devError.ignoreProcessWarning = function ignoreProcessWarning(name: string, value = true): void {
  if (value) {
    if (!_ignoredWarnings) {
      _ignoredWarnings = new Set();
      const _emitWarning = process.emitWarning;

      const emitWarning = (warning: string | Error, a: any, b?: any): void => {
        if (typeof a === "object" && a !== null) {
          a = { ...a, ctor: a.ctor || emitWarning };
          if (
            (a.type !== undefined && devError.isProcessWarningIgnored(a.type)) ||
            (a.code !== undefined && devError.isProcessWarningIgnored(a.code))
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
        if (typeof a === "string" && devError.isProcessWarningIgnored(a)) {
          return;
        }
        _emitWarning(warning, a, b);
      };
      process.emitWarning = emitWarning;
    }
    _ignoredWarnings.add(name);
  } else if (_ignoredWarnings) {
    _ignoredWarnings.delete(name);
  }
};

/** True if a warning was ignored using devError.ignoreProcessWarning function */
devError.isProcessWarningIgnored = function isProcessWarningIgnored(name: string) {
  return _ignoredWarnings !== null && _ignoredWarnings.has(name);
};

devError.setProperty = function setProperty(error: Error, name: string, value: unknown, enumerable = true) {
  if (typeof error === "object" && error !== null) {
    defineProperty(error, name, { value, configurable: true, enumerable, writable: true });
  }
};

devError.setShowStack = function setShowStack(error: Error, value: boolean | "once" | undefined) {
  devError.setProperty(error, "showStack", value);
};

devError.hideProperty = hideProperty;

function hideProperty(error: Error, name: string) {
  if (typeof error === "object" && error !== null && name in error) {
    defineProperty(error, name, {
      value: error[name],
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }
}
