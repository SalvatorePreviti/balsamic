import util from "node:util";
import readline from "node:readline";
import { colors as _colors, getColor, TermColor } from "../colors";
import { ElapsedTime, millisecondsToString } from "../elapsed-time";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import { performance } from "perf_hooks";
import type { Deferred } from "../promises/deferred";
import type { IntervalType, UnsafeAny } from "../types";
import { noop } from "../utils/utils";
import { isCI } from "../dev-env";

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

function makeDevLogStream(options: { log: (...args: unknown[]) => void }, stream: "stderr" | "stdout") {
  const self = {
    colors: _colors,

    log: options.log,

    isTerm() {
      return self.colors.level >= 2 && !isCI() && process[stream].isTTY;
    },

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

      if (!self.isTerm()) {
        self.log("-".repeat(10));
        return;
      }

      if (self.colors.level > 1 && process[stream].isTTY && columns) {
        columns = process[stream].columns;
      }
      if (columns > 250) {
        columns = 250;
      }

      self.log(getColor(color)(char.repeat(columns)));
    },

    capacityBar({
      value,
      min = 0,
      max = 1,
      width = 120,
    }: {
      value: number;
      min?: number | undefined;
      max?: number | undefined;
      width?: number | undefined;
    }) {
      const out = process[stream];
      if (self.isTerm()) {
        width = Math.min(width, out.columns || 50);
      }
      if (width < 15) {
        width = 15;
      }

      let s = ` ${self.colors.blueBright("[")}`;

      const barWidth = width - 13;

      let nv = (value - min) / max;
      if (!nv) {
        nv = 0;
      }

      for (let i = 0; i < barWidth; ++i) {
        const kv = i / (barWidth - 1);
        s += _rgbColorFromValue(kv)(kv <= nv ? "▰" : "𑁉");
      }

      s += `${self.colors.blueBright("]")}`;

      s += _rgbColorFromValue(nv)(
        `${(nv * 100)
          .toLocaleString("en", {
            useGrouping: false,
            decimalDigits: 1,
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })
          .padStart(7, " ")}%`,
      );

      s += "\n";

      out.write(s);
    },
  };

  function _rgbColorFromValue(value: number) {
    const g = Math.max(0, Math.min(190, 245 - Math.floor(value * 255) + 40));
    const r = Math.max(0, Math.min(255, Math.round(value * 255 + 110)));
    return self.colors.rgb(r, g, 35);
  }

  return self;
}

function makeDevLog() {
  const self = {
    ...makeDevLogStream(
      {
        log(...args: unknown[]): void {
          console.log(_devInspectForLogging(args));
        },
      },
      "stdout",
    ),

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
      ...makeDevLogStream(
        {
          log(...args: unknown[]): void {
            console.error(_devInspectForLogging(args));
          },
        },
        "stderr",
      ),
    },

    logException,
    inspectException,
    errorShouldShowStack,

    dev,
    warn,
    info,
    error,
    debug,
    verbose,
    emit,

    inspect,

    logOperationStart,
    logOperationSuccess,
    logOperationError,

    askConfirmation,

    timed,
    timedSync,
    startSpinner,

    greetings,
  };

  function greetings(title: string = "GREETINGS PROFESSOR FALKEN.") {
    self.hr(self.colors.rgb(115, 100, 255));
    self.log(self.colors.rgb(80, 220, 255).bold(title));
    self.hr(self.colors.rgb(115, 100, 255));
    self.log();
  }

  function error(...args: unknown[]): void {
    if (args.length === 0) {
      console.error();
    } else {
      console.error(self.colors.redBright(`❌ ${self.colors.underline("ERROR")}: ${_devInspectForLogging(args)}`));
    }
  }

  function logException(logMessage: string | undefined, exception: unknown, options: LogExceptionOptions = {}): void {
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
  }

  function inspectException(exception: Error, options: LogExceptionOptions = {}): string {
    const showStack = self.errorShouldShowStack(exception, options);

    if (showStack) {
      const inspected = self.inspect(exception) || `${exception}`;
      return showStack !== "once" || _inspectedErrorLoggedSet_add(exception.stack) ? inspected : `${exception}`;
    }

    return `${exception}`;
  }

  function errorShouldShowStack(exception: Error, options: LogExceptionOptions = {}): boolean | "once" {
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
  }

  /** Developer debug log. Appends the line where this function was called. */
  function dev(...args: unknown[]): void {
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
  }

  function warn(...args: unknown[]): void {
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
  }

  function info(...args: unknown[]): void {
    if (args.length === 0) {
      console.info();
    } else {
      console.info(
        self.colors.cyan(
          `${self.colors.cyanBright(`ℹ️  ${self.colors.underline("INFO")}:`)} ${_devInspectForLogging(args)}`,
        ),
      );
    }
  }

  function debug(...args: unknown[]): void {
    if (args.length === 0) {
      console.debug();
    } else {
      console.debug(
        self.colors.blueBright(
          `${self.colors.cyanBright(`🐛  ${self.colors.underline("DEBUG")}:`)} ${_devInspectForLogging(args)}`,
        ),
      );
    }
  }

  function verbose(...args: unknown[]): void {
    if (args.length === 0) {
      console.log();
    } else {
      console.log(
        self.colors.magenta(
          `${self.colors.magentaBright(`📖  ${self.colors.underline("VERBOSE")}:`)} ${_devInspectForLogging(args)}`,
        ),
      );
    }
  }

  function emit(severity: "error" | 2 | "warning" | 1 | "info" | 0 | "debug" | "verbose", ...args: unknown[]): void {
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
  }

  function inspect(what: unknown): string {
    if (what instanceof Error) {
      if (what.showStack === false) {
        return `${what}`;
      }
      what = devError(what, self.inspect);
    }
    return util.inspect(what, self.inspectOptions);
  }

  function logOperationStart(title: string, options: DevLogTimeOptions = { printStarted: true }) {
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
  }

  function logOperationSuccess(
    title: string,
    options: DevLogTimeOptions = { printStarted: true },
    elapsed?: number | undefined,
    text?: string | undefined,
  ) {
    let { timed: isTimed, printStarted, spinner } = options;
    if (isTimed === undefined) {
      isTimed = !!elapsed;
    }
    if (printStarted === undefined) {
      printStarted = isTimed;
    }
    if (isTimed || printStarted) {
      let msg = `${printStarted && !spinner ? "\n" : ""}${self.colors.green("✔")} ${title} ${self.colors.bold("OK")}`;
      if (elapsed && (isTimed || elapsed > 5)) {
        msg += ` in ${millisecondsToString(elapsed)}`;
      }
      msg += ".";
      if (text) {
        msg += ` ${text}`;
      }
      self.log(self.colors.green(msg));
    }
  }

  function logOperationError(
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
  }

  function /** Asks the user to input Yes or No */
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
  }

  let _spinnerStack: string[] | null = null;
  let _spinnerInterval: IntervalType | null = null;
  let _spinnerCounter = 0;

  const _spinnerDraw = () => {
    const chars = startSpinner.chars;
    process.stdout.write(
      `\r${self.colors.blueBright(chars[_spinnerCounter++ % chars.length])} ${
        _spinnerStack![_spinnerStack!.length - 1]
      }${self.colors.blackBright("…")} `,
    );
  };

  function _spinnerStartTimer() {
    _spinnerCounter = 0;
    _spinnerInterval = setInterval(_spinnerDraw, 100).unref();
    process.stdout.write(
      `${self.colors.blueBright("⠿")} ${_spinnerStack![_spinnerStack!.length - 1]}${self.colors.blackBright("…")} `,
    );
  }

  /** Starts a spinner. */

  function startSpinner(title: string = ""): () => void {
    if (!self.isTerm()) {
      return noop;
    }

    if (_spinnerStack === null) {
      _spinnerStack = [];
    }
    _spinnerStack.push(title);

    if (_spinnerStack.length === 1) {
      _spinnerStartTimer();
    }

    let removed = false;
    return () => {
      if (!removed) {
        removed = true;
        startSpinner.pop();
      }
    };
  }

  startSpinner.pop = () => {
    if (_spinnerStack !== null && _spinnerStack.length !== 0) {
      const t = _spinnerStack.pop() || "";
      process.stdout.write(`\r${" ".repeat(t.length + 2)}\r`);
      if (_spinnerStack.length === 0) {
        if (_spinnerInterval) {
          clearInterval(_spinnerInterval);
          _spinnerInterval = null;
        }
      }
    }
  };

  startSpinner.chars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

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
        if (title && !fnOrPromise.name) {
          Reflect.defineProperty(fnOrPromise, "name", { value: title, configurable: true });
        }
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

  timed.wrap = function timed_wrap<R>(title: string, fn: () => R, options?: DevLogTimeOptions | undefined) {
    return () => timed(title, fn, options);
  };

  timed.sync = timedSync;

  function timedSync<R>(title: string, fnOrValue: () => R, options: DevLogTimeOptions = {}): R {
    if (!title) {
      title = fnOrValue.name;
    }
    const _timed = new DevLogTimed(`${title}`, options);
    try {
      _timed.start();
      if (title && !fnOrValue.name) {
        Reflect.defineProperty(fnOrValue, "name", { value: title, configurable: true });
      }
      const result = fnOrValue();
      _timed.end();
      return result;
    } catch (e) {
      _timed.fail(e);
      throw e;
    }
  }

  timedSync.wrap = function timedSync_wrap<R>(
    title: string,
    fn: () => R,
    options?: DevLogTimeOptions | undefined,
  ): () => R {
    return () => timedSync<R>(title, fn, options);
  };

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
    spinner?: boolean | undefined;
  }
}

export type LogExceptionOptions = devLog.LogExceptionOptions;

export type DevLogTimeOptions = devLog.DevLogTimeOptions;

export class DevLogTimed extends ElapsedTime {
  public title: string;
  public options: DevLogTimeOptions;
  public status: Deferred.Status = "starting";
  private _stopSpinner = noop;

  constructor(title: string, options: DevLogTimeOptions = {}) {
    super(performance.now() + (options.elapsed ? +options.elapsed : 0));
    this.title = title;
    this.options = options;
  }

  public start(): this {
    if (this.status === "starting") {
      this.status = "pending";
      if (this.options.spinner) {
        this._stopSpinner = devLog.startSpinner(this.title);
      } else {
        devLog.logOperationStart(this.title, this.options);
      }
    }
    return this;
  }

  public end(text?: string | undefined): void {
    if (this.status === "pending" || this.status === "starting") {
      this._stopSpinner();
      this.stop();
      this.status = "succeeded";
      devLog.logOperationSuccess(this.title, this.options, this.elapsed, text);
    }
  }

  public fail<TError = unknown>(error: TError): TError {
    if (this.status === "pending" || this.status === "starting") {
      this.status = "rejected";
      this._stopSpinner();
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
