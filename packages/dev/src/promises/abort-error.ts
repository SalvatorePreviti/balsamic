export class AbortError extends Error {
  public static code = "ABORT_ERR";

  public serviceTitle?: string;
  public isOk?: boolean;

  public constructor(message: string = "The operation was aborted", options?: Readonly<AbortError.Options>) {
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
    }
  }

  public static isAbortError(error: unknown): error is AbortError {
    return error instanceof AbortError || (error instanceof Error && error.code === "ABORT_ERR");
  }
}

AbortError.prototype.code = "ABORT_ERR";
AbortError.prototype.name = AbortError.name;

export namespace AbortError {
  export interface Options extends ErrorOptions {
    caller?: Function;
    serviceTitle?: string;
    isOk?: boolean;
  }

  export class ServiceTerminatedError extends AbortError {
    public serviceTitle?: string = undefined;

    public constructor(message?: string, options?: Readonly<AbortError.Options>) {
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
}
