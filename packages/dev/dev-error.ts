import "./types";
import type { UnsafeAny } from "./types";

const { defineProperty } = Reflect;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError>(error: TError): TError extends Error ? TError : Error;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError>(error: TError, caller: Function): TError extends Error ? TError : Error;

/** Fixes an error, the return value is always an Error instance */
export function devError<TError, TFields extends {}>(
  error: TError,
  fields: TFields,
  caller?: Function | undefined | null,
): (TError extends Error ? TError : Error) & TFields;

/** Fixes an error, the return value is always an Error instance */
export function devError(error?: unknown | undefined, a?: unknown | undefined, b?: unknown | undefined | null) {
  try {
    if (!(error instanceof Error)) {
      if (typeof error === "object" && error !== null) {
        let options: { cause?: Error } | undefined;
        if (typeof a === "object" && a !== null) {
          if (a instanceof Error) {
            options = { cause: a };
          } else if ((a as { cause?: Error }).cause instanceof Error) {
            options = { cause: (a as { cause: Error }).cause };
          }
        }
        error = options
          ? new Error((error as Error).message || "Unknown error", options)
          : new Error((error as Error).message || "Unknown error");
      } else {
        error = new Error((error as string) || "Unknown error");
      }
      if (!("stack" in (error as {}))) {
        Error.captureStackTrace(error as {}, typeof b === "function" ? b : typeof a === "function" ? a : devError);
      }
    }

    if (typeof a === "string") {
      if (a.length > 0) {
        devError.setReason(error, a);
      }
    } else if (a instanceof Error && a !== error) {
      devError.setCause(error, a);
    } else if (typeof a === "object" && a !== null) {
      devError.setProperties(error, a, true);
    }

    // Hide some unuseful properties

    hideProperty(error, "showStack");
    hideProperty(error, "codeFrame");
    hideProperty(error, "watchFiles");

    if ((error as Error).isAxiosError) {
      hideProperty(error, "response");
    }
    hideProperty(error, "request");
    hideProperty(error, "config");
  } catch {}

  return error;
}

defineProperty(devError, "prototype", { value: Error, configurable: true, writable: true });

devError.setProperty = function setProperty<TError = Error>(
  error: TError,
  name: string,
  value: unknown,
  enumerable?: boolean | undefined,
): TError {
  if (typeof error === "object" && error !== null) {
    if (enumerable === undefined) {
      if (
        value === error ||
        value === global ||
        value === this ||
        value === undefined ||
        typeof value === "symbol" ||
        typeof value === "function" ||
        name === "cause" ||
        name === "message" ||
        name === "showStack" ||
        name === "request" ||
        name === "response" ||
        ((error as { isAxiosError?: boolean }).isAxiosError && name === "config")
      ) {
        enumerable = false;
      } else {
        const descriptor = Reflect.getOwnPropertyDescriptor(error as {}, "name");
        enumerable = descriptor ? !!descriptor.enumerable : true;
      }
    }
    defineProperty(error as {}, name, { value, configurable: true, enumerable, writable: true });
  }
  return error;
};

devError.addProperty = function addProperty<TError = Error>(
  error: TError,
  name: string,
  value: unknown,
  enumerable?: boolean | undefined,
): TError {
  if (!(name in error)) {
    devError.setProperty(error, name, value, enumerable);
  }
  return error;
};

devError.addProperties = function addProperties<TError = Error>(
  error: TError,
  obj: {},
  enumerable?: boolean | undefined,
): TError {
  for (const [key, value] of Object.entries(obj)) {
    devError.addProperty<TError>(error, key, value, enumerable);
  }
  return error;
};

devError.setProperties = function setProperties<TError = Error>(
  error: TError,
  obj: {},
  enumerable?: boolean | undefined,
): TError {
  for (const [key, value] of Object.entries(obj)) {
    devError.setProperty<TError>(error, key, value, enumerable);
  }
  return error;
};

devError.setShowStack = function setShowStack<TError = Error>(
  error: TError,
  value: boolean | "once" | undefined,
): TError {
  return devError.setProperty<TError>(error, "showStack", value, false);
};

devError.hideStack = function hideStack<TError = Error>(error: TError): TError {
  return devError.setProperty<TError>(error, "showStack", false, false);
};

devError.setCause = function setCause<TError = Error>(error: TError, cause: Error | undefined | null | false): TError {
  return devError.setProperty<TError>(error, "cause", cause ?? undefined, false);
};

devError.setReason = function setReason<TError = Error>(error: TError, reason: unknown): TError {
  return devError.setProperty<TError>(error, "reason", reason, false);
};

devError.setMessage = function setMessage<TError = Error>(error: TError, message: string): TError {
  return devError.setProperty<TError>(error, "message", message, false);
};

devError.hideProperty = hideProperty;

function hideProperty<TError = Error>(error: TError, name: string): TError {
  if (typeof error === "object" && error !== null && name in error) {
    devError.setProperty(error, name, (error as Record<string, unknown>)[name], false);
  }
  return error;
}

devError.getMessage = function getMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const msg = (error as UnsafeAny).message;
    if (msg !== error) {
      return getMessage(msg);
    }
    try {
      return `${msg}`;
    } catch {
      return "";
    }
  }
  if (typeof error === "symbol") {
    return error.toString();
  }
  return `${error}`;
};
