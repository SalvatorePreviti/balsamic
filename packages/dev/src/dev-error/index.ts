import "../types";

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
export function devError(error?: any | undefined, a?: any | undefined, b?: any | undefined | null) {
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
    }
    hideProperty(error, "request");
    hideProperty(error, "config");
  } catch {}

  return error;
}

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

devError.setShowStack = function setShowStack<TError = Error>(
  error: TError,
  value: boolean | "once" | undefined,
): TError {
  return devError.setProperty<TError>(error, "showStack", value, false);
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
