import { devError } from "../dev-error";

export class AbortError extends Error {
  public static code = "ABORT_ERR";

  public serviceTitle?: string | undefined;
  public isOk?: boolean | undefined;

  public constructor(
    message: string = "The operation was aborted",
    options?: Readonly<AbortError.Options> | undefined,
  ) {
    super(message, options);

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

AbortError.prototype.code = "ABORT_ERR";
AbortError.prototype.name = AbortError.name;
AbortError.prototype.showStack = "once";

export namespace AbortError {
  export interface Options extends ErrorOptions {
    caller?: Function | undefined;
    serviceTitle?: string | undefined;
    isOk?: boolean | undefined;
  }

  export class ServiceTerminatedError extends AbortError {
    public constructor(message?: string | undefined, options?: Readonly<AbortError.Options> | undefined) {
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

  export class AbortOk extends AbortError {
    public constructor(message?: string | undefined, options?: Readonly<AbortError.Options> | undefined) {
      let isOk = options && options.isOk;
      if (isOk === undefined) {
        isOk = true;
      }
      super(message || (isOk ? "OK." : undefined), options);
      this.isOk = isOk;
    }
  }

  AbortOk.prototype.showStack = false;
}
