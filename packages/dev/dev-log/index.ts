import util from "node:util";
import readline from "node:readline";
import { colors as _colors, getColor, TermColor } from "../colors";
import { ElapsedTime, millisecondsToString } from "../elapsed-time";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import { performance } from "perf_hooks";
import type { Deferred } from "../promises/deferred";
import type { UnsafeAny } from "../types";

const _inspectedErrorLoggedSet = new Set<unknown>();

const _inspectedErrorLoggedSet_maxSize = 25;

function _inspectedErrorLoggedSet_add(value: unknown): boolean {
  if (_inspectedErrorLoggedSet.has(value)) {
    return false;
  }
  if (_inspectedErrorLoggedSet.size > _inspectedErrorLoggedSet_maxSize) {
    for (const item of _inspectedErrorLoggedSet) {
      if (_inspectedErrorLoggedSet.size <= _inspectedErrorLoggedSet_maxSize) {
        break;
      }
      _inspectedErrorLoggedSet.delete(item);
    }
  }
  _inspectedErrorLoggedSet.add(value);
  return true;
}

function makeDevLogStream(options: { log: (...args: unknown[]) => void }) {
  const self = {
    colors: _colors,

    log: options.log,

    logBlack(...args: unknown[]): void {
      self.log(self.colors.black(_devInspectForLogging(args)));
    },

    logRed(...args: unknown[]): void {
      self.log(self.colors.red(_devInspectForLogging(args)));
    },

    logGreen(...args: unknown[]): void {
      self.log(self.colors.green(_devInspectForLogging(args)));
    },

    logYellow(...args: unknown[]): void {
      self.log(self.colors.yellow(_devInspectForLogging(args)));
    },

    logBlue(...args: unknown[]): void {
      self.log(self.colors.blue(_devInspectForLogging(args)));
    },

    logMagenta(...args: unknown[]): void {
      self.log(self.colors.magenta(_devInspectForLogging(args)));
    },

    logCyan(...args: unknown[]): void {
      self.log(self.colors.cyan(_devInspectForLogging(args)));
    },

    logWhite(...args: unknown[]): void {
      self.log(self.colors.white(_devInspectForLogging(args)));
    },

    logBlackBright(...args: unknown[]): void {
      self.log(self.colors.blackBright(_devInspectForLogging(args)));
    },

    logRedBright(...args: unknown[]): void {
      self.log(self.colors.redBright(_devInspectForLogging(args)));
    },

    logGreenBright(...args: unknown[]): void {
      self.log(self.colors.greenBright(_devInspectForLogging(args)));
    },

    logYellowBright(...args: unknown[]): void {
      self.log(self.colors.yellowBright(_devInspectForLogging(args)));
    },

    logBlueBright(...args: unknown[]): void {
      self.log(self.colors.blueBright(_devInspectForLogging(args)));
    },

    logMagentaBright(...args: unknown[]): void {
      self.log(self.colors.magentaBright(_devInspectForLogging(args)));
    },

    logCyanBright(...args: unknown[]): void {
      self.log(self.colors.cyanBright(_devInspectForLogging(args)));
    },

    logWhiteBright(...args: unknown[]): void {
      self.log(self.colors.whiteBright(_devInspectForLogging(args)));
    },

    logColor(color: TermColor, ...args: unknown[]): void {
      if (self.colors.level > 0) {
        self.log(getColor(color)(_devInspectForLogging(args)));
      } else {
        self.log(_devInspectForLogging(args));
      }
    },

    /** Prints an horizontal line */
    hr(color?: TermColor | null | undefined, char = "⎯") {
      let columns = 10;

      if (self.colors.level < 1 || !process.stdout.isTTY) {
        self.log("-".repeat(10));
        return;
      }

      if (self.colors.level > 1 && process.stdout.isTTY && columns) {
        columns = process.stdout.columns;
      }
      if (columns > 250) {
        columns = 250;
      }

      self.log(getColor(color)(char.repeat(columns)));
    },
  };

  return self;
}

function makeDevLog() {
  const self = {
    ...makeDevLogStream({
      log(...args: unknown[]): void {
        console.log(_devInspectForLogging(args));
      },
    }),

    inspectOptions: {
      ...util.inspect.defaultOptions,
      colors: !!_colors.supportsColor && _colors.supportsColor.hasBasic,
      depth: Math.max(8, util.inspect.defaultOptions.depth || 0),
    },

    /** Default on wether abort errors are treated as warnings or not */
    abortErrorIsWarning: true,

    /** Default option on how stack trace should be shown */
    defaultShowStack: "once" as boolean | "once",

    stderr: {
      ...makeDevLogStream({
        log(...args: unknown[]): void {
          console.error(_devInspectForLogging(args));
        },
      }),
    },

    error(...args: unknown[]): void {
      if (args.length === 0) {
        console.error();
      } else {
        console.error(self.colors.redBright(`❌ ${self.colors.underline("ERROR")}: ${_devInspectForLogging(args)}`));
      }
    },

    logException(logMessage: string | undefined, exception: unknown, options: LogExceptionOptions = {}): void {
      let err;
      let isAbortError = false;
      let isOk = false;

      if (exception instanceof Error) {
        isAbortError = AbortError.isAbortError(exception);
        isOk = isAbortError && exception.isOk === true;

        err = self.inspectException(exception, options);
        if (err.includes("\n") && !err.endsWith("\n\n")) {
          err += "\n";
        }
      } else {
        err = exception;
      }

      if (logMessage) {
        if (isAbortError) {
          if (isOk) {
            self.info(logMessage, err);
          } else if (options.abortErrorIsWarning ?? self.abortErrorIsWarning) {
            if (err === "AbortError: The operation was aborted") {
              self.warn(logMessage);
            } else {
              self.warn(logMessage, err);
            }
          } else {
            self.error(logMessage, err);
          }
        } else {
          self.error(logMessage, err);
        }
      } else if (isAbortError) {
        if (isOk) {
          self.info(err);
        } else if (options.abortErrorIsWarning ?? self.abortErrorIsWarning) {
          self.warn(err);
        } else {
          self.error(err);
        }
      } else {
        self.error(err);
      }
    },

    inspectException(exception: Error, options: LogExceptionOptions = {}): string {
      const showStack = self.errorShouldShowStack(exception, options);

      if (showStack) {
        const inspected = self.inspect(exception) || `${exception}`;
        return showStack !== "once" || _inspectedErrorLoggedSet_add(exception.stack) ? inspected : `${exception}`;
      }

      return `${exception}`;
    },

    errorShouldShowStack(exception: Error, options: LogExceptionOptions = {}): boolean | "once" {
      let showStack: boolean | "once" | undefined;

      const errorShowStack = exception.showStack;
      if (errorShowStack === false || errorShowStack === true || errorShowStack === "once") {
        showStack = errorShowStack;
      }

      if (showStack === undefined || showStack) {
        const optionsShowStack = options.showStack;
        if (optionsShowStack === false || optionsShowStack === true || optionsShowStack === "once") {
          showStack = optionsShowStack;
        }
      }

      if (showStack === undefined) {
        showStack = self.defaultShowStack;
      }

      return showStack;
    },

    /** Developer debug log. Appends the line where this function was called. */
    dev(...args: unknown[]): void {
      const oldStackTraceLimit = Error.stackTraceLimit;
      const err: { stack?: string | undefined } = {};
      Error.stackTraceLimit = 1;
      try {
        Error.captureStackTrace(err, self.dev);
      } finally {
        Error.stackTraceLimit = oldStackTraceLimit;
      }
      let devLine = "";
      const stack = err.stack;
      if (typeof stack === "string") {
        for (const line of stack.split("\n")) {
          if (line.startsWith("    at")) {
            devLine = line.trim();
            break;
          }
        }
      }
      self.log(
        self.colors.blueBright(`${self.colors.underline("DEV")}: `) +
          self.colors.blueBright(_devInspectForLogging(args)) +
          (devLine ? `\n     ${self.colors.blackBright(devLine)}` : ""),
      );
    },

    warn(...args: unknown[]): void {
      if (args.length === 0) {
        console.warn();
      } else {
        console.warn(
          self.colors.rgb(
            200,
            200,
            50,
          )(`${self.colors.yellowBright(`⚠️  ${self.colors.underline("WARNING")}:`)} ${_devInspectForLogging(args)}`),
        );
      }
    },

    info(...args: unknown[]): void {
      if (args.length === 0) {
        console.info();
      } else {
        console.info(
          self.colors.cyan(
            `${self.colors.cyanBright(`ℹ️  ${self.colors.underline("INFO")}:`)} ${_devInspectForLogging(args)}`,
          ),
        );
      }
    },

    debug(...args: unknown[]): void {
      if (args.length === 0) {
        console.debug();
      } else {
        console.debug(
          self.colors.blueBright(
            `${self.colors.cyanBright(`🐛  ${self.colors.underline("DEBUG")}:`)} ${_devInspectForLogging(args)}`,
          ),
        );
      }
    },

    verbose(...args: unknown[]): void {
      if (args.length === 0) {
        console.log();
      } else {
        console.log(
          self.colors.magenta(
            `${self.colors.magentaBright(`📖  ${self.colors.underline("VERBOSE")}:`)} ${_devInspectForLogging(args)}`,
          ),
        );
      }
    },

    emit(severity: "error" | 2 | "warning" | 1 | "info" | 0 | "debug" | "verbose", ...args: unknown[]): void {
      switch (severity) {
        case 2:
        case "error":
          self.error(...args);
          break;
        case 1:
        case "warning":
          self.warn(...args);
          break;
        case 0:
        case "info":
          self.info(...args);
          break;
        case "debug":
          self.debug(...args);
          break;
        case "verbose":
          self.verbose(...args);
          break;
        default:
          self.log(...args);
          break;
      }
    },

    inspect(what: unknown): string {
      if (what instanceof Error) {
        if (what.showStack === false) {
          return `${what}`;
        }
        what = devError(what, self.inspect);
      }
      return util.inspect(what, self.inspectOptions);
    },

    logOperationStart(title: string, options: DevLogTimeOptions = { printStarted: true }) {
      let { timed: isTimed, printStarted } = options;
      if (isTimed === undefined) {
        isTimed = true;
      }
      if (printStarted === undefined) {
        printStarted = isTimed;
      }
      if (printStarted) {
        self.log(self.colors.cyan(`${self.colors.cyan("◆")} ${title}`) + self.colors.gray(" started..."));
      }
    },

    logOperationSuccess(
      title: string,
      options: DevLogTimeOptions = { printStarted: true },
      elapsed?: number | undefined,
      text?: string | undefined,
    ) {
      let { timed: isTimed, printStarted } = options;
      if (isTimed === undefined) {
        isTimed = !!elapsed;
      }
      if (printStarted === undefined) {
        printStarted = isTimed;
      }
      if (isTimed || printStarted) {
        let msg = `${printStarted ? "\n" : ""}${self.colors.green("✔")} ${title} ${self.colors.bold("OK")}`;
        if (elapsed && (isTimed || elapsed > 5)) {
          msg += ` in ${millisecondsToString(elapsed)}`;
        }
        msg += ".";
        if (text) {
          msg += ` ${text}`;
        }
        self.log(self.colors.green(msg));
      }
    },

    logOperationError(
      title: string,
      exception: unknown,
      options: DevLogTimeOptions = { logError: true },
      elapsed?: number | undefined,
    ) {
      let { timed: isTimed, logError } = options;
      if (logError === undefined) {
        logError = true;
      }
      if (logError) {
        if (isTimed === undefined) {
          isTimed = !!elapsed;
        }

        const isAbortError = AbortError.isAbortError(exception);

        const msg = `${title} ${isAbortError ? "aborted" : "FAILED"}${
          elapsed && (isTimed || elapsed > 5) ? ` in ${millisecondsToString(elapsed)}` : ""
        }.`;

        if (options.showStack === undefined && isAbortError) {
          options = { ...options, showStack: false };
        }

        self.logException(msg, exception, options);
      }
    },

    /** Asks the user to input Yes or No */
    askConfirmation(confirmationMessage: string, defaultValue: boolean) {
      if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
        return true;
      }
      return new Promise((resolve) => {
        const rl = readline.createInterface(process.stdin, process.stdout as UnsafeAny);
        const question = `${self.colors.greenBright("?")} ${self.colors.whiteBright(
          confirmationMessage,
        )} ${self.colors.gray(defaultValue ? "(Y/n)" : "(N/y)")} `;
        rl.question(question, (answer) => {
          rl.close();
          answer = (answer || "").trim();
          const confirm = /^[yY]/.test(answer || (defaultValue ? "Y" : "N"));
          console.log(confirm ? self.colors.greenBright("  Yes") : self.colors.redBright("  No"));
          console.log();
          resolve(confirm);
        });
      });
    },

    timed,
  };

  /** Prints how much time it takes to run something */
  function timed<T>(
    title: string,
    fnOrPromise: (() => Promise<T> | T) | Promise<T> | T,
    options?: DevLogTimeOptions | undefined,
  ): Promise<Awaited<T>>;

  /** Prints how much time it takes to run something */
  function timed<T>(
    title: string,
    fnOrPromise: null | undefined | (() => Promise<T> | T) | Promise<T> | T,
    options?: DevLogTimeOptions | undefined,
  ): Promise<null | undefined | T>;

  async function timed(title: unknown, fnOrPromise: unknown, options: DevLogTimeOptions = {}) {
    if (fnOrPromise === null || (typeof fnOrPromise !== "object" && typeof fnOrPromise !== "function")) {
      return fnOrPromise;
    }
    if (typeof fnOrPromise === "object" && typeof (fnOrPromise as UnsafeAny).then !== "function") {
      return fnOrPromise;
    }
    if (!title && typeof fnOrPromise === "function") {
      title = fnOrPromise.name;
    }

    const _timed = new DevLogTimed(`${title}`, options);
    try {
      _timed.start();
      if (typeof fnOrPromise === "function") {
        fnOrPromise = fnOrPromise();
      }
      const result = await fnOrPromise;
      _timed.end();
      return result;
    } catch (e) {
      _timed.fail(e);
      throw e;
    }
  }

  return self;
}

export const devLog = makeDevLog();

export namespace devLog {
  export interface LogExceptionOptions {
    showStack?: boolean | "once" | undefined;
    abortErrorIsWarning?: boolean | undefined;
  }

  export interface DevLogTimeOptions extends LogExceptionOptions {
    printStarted?: boolean | undefined;
    logError?: boolean | undefined;
    timed?: boolean | undefined;
    elapsed?: number | undefined;
  }
}

export type LogExceptionOptions = devLog.LogExceptionOptions;

export type DevLogTimeOptions = devLog.DevLogTimeOptions;

export class DevLogTimed extends ElapsedTime {
  public title: string;
  public options: DevLogTimeOptions;
  public status: Deferred.Status = "starting";

  constructor(title: string, options: DevLogTimeOptions = {}) {
    super(performance.now() + (options.elapsed ? +options.elapsed : 0));
    this.title = title;
    this.options = options;
  }

  public start(): this {
    if (this.status === "starting") {
      this.status = "pending";
      devLog.logOperationStart(this.title, this.options);
    }
    return this;
  }

  public end(text?: string | undefined): void {
    if (this.status === "pending" || this.status === "starting") {
      this.stop();
      this.status = "succeeded";
      devLog.logOperationSuccess(this.title, this.options, this.elapsed, text);
    }
  }

  public fail<TError = unknown>(error: TError): TError {
    if (this.status === "pending" || this.status === "starting") {
      this.status = "rejected";
      this.stop();
      devLog.logOperationError(this.title, error, this.options, this.elapsed);
    }
    return error;
  }

  /** True if completed, with or without errors */
  public get isSettled() {
    return this.status === "succeeded" || this.status === "rejected";
  }

  /** True if completed without errors */
  public get isSucceeded() {
    return this.status === "succeeded";
  }

  /** True if failed */
  public get isRejected() {
    return this.status === "rejected";
  }
}

function _devInspectForLogging(args: unknown[]) {
  return args.map((what) => (typeof what === "string" ? what : devLog.inspect(what))).join(" ");
}
