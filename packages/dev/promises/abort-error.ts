import { devError } from "../dev-error";

export interface AbortErrorOptions extends ErrorOptions {
  cause?: Error;
  caller?: Function | undefined;
  serviceTitle?: string | undefined;
  isOk?: boolean | undefined;
}

export class AbortError extends Error {
  public static code = "ABORT_ERR";

  public serviceTitle?: string | undefined;
  public isOk?: boolean | undefined;

  public static ServiceTerminatedError: typeof ServiceTerminatedError;
  public static AbortOk: typeof ServiceTerminatedError;

  public constructor();

  public constructor(options: Readonly<AbortErrorOptions & { message?: string | undefined }>);

  public constructor(message: string | Error | undefined, options?: Readonly<AbortErrorOptions> | undefined);

  public constructor(
    message:
      | string
      | Error
      | Readonly<AbortErrorOptions & { message?: string | undefined }>
      | undefined = "The operation was aborted",
    options?: Readonly<AbortErrorOptions> | undefined,
  ) {
    if (typeof message === "object" && message !== null) {
      if (message instanceof Error) {
        options = { ...options, cause: options?.cause || message };
        message = message.message;
      } else if (options === undefined) {
        options = message;
        message = message.message;
      }
    }
    super(message as string, options as ErrorOptions);

    const caller = options?.caller;
    Error.captureStackTrace(this, typeof caller === "function" ? caller : new.target);
    this.code = "ABORT_ERR";
    const serviceTitle = options?.serviceTitle;
    if (serviceTitle !== undefined) {
      this.serviceTitle = serviceTitle;
    }
    if (options?.isOk === true) {
      this.isOk = true;
      const showStackValue = AbortError.AbortOk.prototype.showStack;
      if (this.showStack !== showStackValue) {
        devError.setShowStack(this, showStackValue);
      }
    }
  }

  public static isAbortError(error: unknown): error is AbortError {
    return error instanceof AbortError || (error instanceof Error && error.code === "ABORT_ERR");
  }
}

AbortError.prototype.name = AbortError.name;
AbortError.prototype.showStack = "once";
AbortError.prototype.isOk = false;
AbortError.prototype.code = "ABORT_ERR";

class ServiceTerminatedError extends AbortError {
  public constructor(message?: string | undefined, options?: Readonly<AbortErrorOptions> | undefined) {
    if (!options || !options.caller) {
      options = { ...options, caller: new.target };
    }
    if (!message) {
      try {
        message = options.serviceTitle ? `Service "${options.serviceTitle}" terminated.` : "Service terminated.";
        if (options.cause instanceof Error) {
          message += ` ${options.cause}`;
        }
      } catch {}
    }
    super(message || "Service terminated.", options);
  }
}

ServiceTerminatedError.prototype.name = ServiceTerminatedError.name;
AbortError.ServiceTerminatedError = ServiceTerminatedError;

class AbortOk extends AbortError {
  public constructor(message?: string | undefined, options?: Readonly<AbortErrorOptions> | undefined) {
    let isOk = options && options.isOk;
    if (isOk === undefined) {
      isOk = true;
    }
    super(message || (isOk ? "OK." : undefined), options);
    this.isOk = isOk;
  }
}

AbortOk.prototype.name = AbortOk.name;
AbortOk.prototype.showStack = false;
AbortOk.prototype.isOk = true;
AbortError.AbortOk = AbortOk;
