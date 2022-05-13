import util from "node:util";
import readline from "node:readline";
import { Chalk, colors as _colors, colors_disabled, getColor, TermColor } from "../colors";
import { ElapsedTime, millisecondsToString } from "../elapsed-time";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import { performance } from "perf_hooks";
import type { Deferred } from "../promises/deferred";
import type { IntervalType, UnsafeAny } from "../types";
import { noop } from "../utils/utils";
import { isCI } from "../dev-env";
import { numberFixedString } from "../utils/number-fixed";

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

    getColor(color: TermColor | null | undefined): Chalk {
      return self.colors.level > 0 ? getColor(color) : colors_disabled;
    },

    isTerm() {
      return self.colors.level >= 2 && !isCI() && process[stream].isTTY;
    },

    logBlack(...args: unknown[]): void {
      self.log(self.colors.black(_devInspectForLogging(args, "")));
    },

    logRed(...args: unknown[]): void {
      self.log(self.colors.red(_devInspectForLogging(args, "")));
    },

    logGreen(...args: unknown[]): void {
      self.log(self.colors.green(_devInspectForLogging(args, "")));
    },

    logYellow(...args: unknown[]): void {
      self.log(self.colors.yellow(_devInspectForLogging(args, "")));
    },

    logBlue(...args: unknown[]): void {
      self.log(self.colors.blue(_devInspectForLogging(args, "")));
    },

    logMagenta(...args: unknown[]): void {
      self.log(self.colors.magenta(_devInspectForLogging(args, "")));
    },

    logCyan(...args: unknown[]): void {
      self.log(self.colors.cyan(_devInspectForLogging(args, "")));
    },

    logWhite(...args: unknown[]): void {
      self.log(self.colors.white(_devInspectForLogging(args, "")));
    },

    logBlackBright(...args: unknown[]): void {
      self.log(self.colors.blackBright(_devInspectForLogging(args, "")));
    },

    logRedBright(...args: unknown[]): void {
      self.log(self.colors.redBright(_devInspectForLogging(args, "")));
    },

    logGreenBright(...args: unknown[]): void {
      self.log(self.colors.greenBright(_devInspectForLogging(args, "")));
    },

    logYellowBright(...args: unknown[]): void {
      self.log(self.colors.yellowBright(_devInspectForLogging(args, "")));
    },

    logBlueBright(...args: unknown[]): void {
      self.log(self.colors.blueBright(_devInspectForLogging(args, "")));
    },

    logMagentaBright(...args: unknown[]): void {
      self.log(self.colors.magentaBright(_devInspectForLogging(args, "")));
    },

    logCyanBright(...args: unknown[]): void {
      self.log(self.colors.cyanBright(_devInspectForLogging(args, "")));
    },

    logWhiteBright(...args: unknown[]): void {
      self.log(self.colors.whiteBright(_devInspectForLogging(args, "")));
    },

    logColor(color: TermColor, ...args: unknown[]): void {
      self.log(self.getColor(color)(_devInspectForLogging(args, "")));
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

      self.log(self.getColor(color)(char.repeat(columns)));
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
      s += _rgbColorFromValue(nv)(numberFixedString(nv * 100, { decimalDigits: 1, padStart: 7, postix: "%" }));
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

export const devLog = {
  ...makeDevLogStream(
    {
      log(...args: unknown[]): void {
        console.log(_devInspectForLogging(args, ""));
      },
    },
    "stdout",
  ),

  inspectOptions: {
    ...util.inspect.defaultOptions,
    colors: !!_colors.supportsColor && _colors.supportsColor.hasBasic,
    depth: Math.max(8, util.inspect.defaultOptions.depth || 0),
  },

  options: {
    /** Default option on how stack trace should be shown */
    showStack: "once" as boolean | "once",

    /** Default on wether abort errors are treated as warnings or not */
    abortErrorIsWarning: true,

    titlePaddingWidth: 0,
  },

  stderr: {
    ...makeDevLogStream(
      {
        log(...args: unknown[]): void {
          console.error(_devInspectForLogging(args, ""));
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
  notice,
  emit,

  inspect,

  logOperationStart,
  logOperationSuccess,
  logOperationError,

  askConfirmation,

  startSpinner,

  titled,
  timed,
  timedSync,

  greetings,
};

function greetings(title: string = "GREETINGS PROFESSOR FALKEN.") {
  devLog.hr(devLog.colors.rgb(115, 100, 255));
  devLog.log(devLog.colors.rgb(80, 220, 255).bold(title));
  devLog.hr(devLog.colors.rgb(115, 100, 255));
  devLog.log();
}

function error(...args: unknown[]): void {
  console.error(devLog.colors.redBright(_devInspectForLogging(args, `❌ ${devLog.colors.underline("ERROR")}: `)));
}

function logException(logMessage: string | undefined, exception: unknown, options: LogExceptionOptions = {}): void {
  let err;
  let isAbortError = false;
  let isOk = false;

  if (exception instanceof Error) {
    isAbortError = AbortError.isAbortError(exception);
    isOk = isAbortError && exception.isOk === true;

    err = devLog.inspectException(exception, options);
    if (err.includes("\n") && !err.endsWith("\n\n")) {
      err += "\n";
    }
  } else {
    err = exception;
  }

  if (logMessage) {
    if (isAbortError) {
      if (isOk) {
        devLog.info(logMessage, err);
      } else if (options.abortErrorIsWarning ?? devLog.options.abortErrorIsWarning) {
        if (err === "AbortError: The operation was aborted") {
          devLog.warn(logMessage);
        } else {
          devLog.warn(logMessage, err);
        }
      } else {
        devLog.error(logMessage, err);
      }
    } else {
      devLog.error(logMessage, err);
    }
  } else if (isAbortError) {
    if (isOk) {
      devLog.info(err);
    } else if (options.abortErrorIsWarning ?? devLog.options.abortErrorIsWarning) {
      devLog.warn(err);
    } else {
      devLog.error(err);
    }
  } else {
    devLog.error(err);
  }
}

function inspectException(exception: Error, options: LogExceptionOptions = {}): string {
  const showStack = devLog.errorShouldShowStack(exception, options);

  if (showStack) {
    const inspected = devLog.inspect(exception) || `${exception}`;
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
    showStack = devLog.options.showStack;
  }

  return showStack;
}

/** Developer debug log. Appends the line where this function was called. */
function dev(...args: unknown[]): void {
  const oldStackTraceLimit = Error.stackTraceLimit;
  const err: { stack?: string | undefined } = {};
  Error.stackTraceLimit = 1;
  try {
    Error.captureStackTrace(err, devLog.dev);
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
  devLog.log(
    devLog.colors.blueBright(
      _devInspectForLogging(args.length > 0 ? args : [""], `${devLog.colors.underline("DEV")}: `),
    ) + (devLine ? `\n     ${devLog.colors.blackBright(devLine)}` : ""),
  );
}

function warn(...args: unknown[]): void {
  console.warn(
    devLog.colors.yellow(
      _devInspectForLogging(args, `${devLog.colors.yellowBright(`⚠️  ${devLog.colors.underline("WARNING")}:`)} `),
    ),
  );
}

function info(...args: unknown[]): void {
  console.info(
    devLog.colors.cyan(
      devLog.colors.cyanBright(_devInspectForLogging(args, `ℹ️  ${devLog.colors.underline("INFO")}: `)),
    ),
  );
}

function debug(...args: unknown[]): void {
  console.debug(
    devLog.colors.blueBright(
      _devInspectForLogging(args, devLog.colors.cyanBright(`🐛  ${devLog.colors.underline("DEBUG")}: `)),
    ),
  );
}

function verbose(...args: unknown[]): void {
  console.log(
    devLog.colors.magenta(
      _devInspectForLogging(args, devLog.colors.magentaBright(`📖 ${devLog.colors.underline("VERBOSE")}: `)),
    ),
  );
}

function notice(...args: unknown[]): void {
  console.log(devLog.getColor("notice")(_devInspectForLogging(args, "⬢ ")));
}

function emit(
  severity: "error" | 2 | "warning" | 1 | "info" | 0 | "debug" | "verbose" | "notice",
  ...args: unknown[]
): void {
  switch (severity) {
    case 2:
    case "error":
      devLog.error(...args);
      break;
    case 1:
    case "warning":
      devLog.warn(...args);
      break;
    case 0:
    case "info":
      devLog.info(...args);
      break;
    case "debug":
      devLog.debug(...args);
      break;
    case "verbose":
      devLog.verbose(...args);
      break;
    case "notice":
      devLog.notice(...args);
      break;
    default:
      devLog.log(...args);
      break;
  }
}

function inspect(what: unknown): string {
  if (what instanceof Error) {
    if (what.showStack === false) {
      return `${what}`;
    }
    what = devError(what, devLog.inspect);
  }
  return util.inspect(what, devLog.inspectOptions);
}

function logOperationStart(title: string, options: DevLogTimedOptions = { printStarted: true }) {
  let { timed: isTimed, printStarted } = options;
  if (isTimed === undefined) {
    isTimed = true;
  }
  if (printStarted === undefined) {
    printStarted = isTimed;
  }
  if (printStarted) {
    const titlePaddingWidth = (options.titlePaddingWidth ?? devLog.options.titlePaddingWidth) || 0;
    if (titlePaddingWidth > 0) {
      title = title.padEnd(titlePaddingWidth, " ");
    }
    devLog.log(devLog.colors.cyan(`${devLog.colors.cyan("◆")} ${title}`) + devLog.colors.gray(" started..."));
  }
}

function logOperationSuccess(
  title: string,
  options: DevLogTimedOptions = { printStarted: true },
  elapsed?: number | undefined | null,
  successText?: string | undefined,
) {
  let { timed: isTimed, printStarted, spinner } = options;
  if (isTimed === undefined) {
    isTimed = !!elapsed;
  }
  if (printStarted === undefined) {
    printStarted = isTimed;
  }

  successText = successText !== null && successText !== undefined ? `${successText}` : "";

  if (isTimed || printStarted) {
    const titlePaddingWidth = (options.titlePaddingWidth ?? devLog.options.titlePaddingWidth) || 0;
    if (titlePaddingWidth > 0) {
      title = title.padEnd(titlePaddingWidth, " ");
    }
    let msg = `${printStarted && !spinner ? "\n" : ""}${devLog.colors.greenBright("✔")} ${title} ${devLog.colors.bold(
      "OK",
    )}`;

    if (elapsed && (isTimed || elapsed > 5 || titlePaddingWidth)) {
      if (titlePaddingWidth) {
        msg += `.${devLog.colors.blueBright(` ${millisecondsToString(elapsed, { fixed: "s" })}`)}`;
      } else {
        msg += " in ";
        msg += millisecondsToString(elapsed);
        msg += ".";
      }
    } else {
      msg += ".";
    }

    if (successText) {
      msg += "  ";
      msg += devLog.getColor("notice")(successText);
    }
    devLog.log(devLog.colors.green(msg));
  }
}

function logOperationError(
  title: string,
  exception: unknown,
  options: DevLogTimedOptions = { logError: true },
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

    devLog.logException(msg, exception, options);
  }
}

function /** Asks the user to input Yes or No */
askConfirmation(confirmationMessage: string, defaultValue: boolean) {
  if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
    return true;
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface(process.stdin, process.stdout as UnsafeAny);
    const question = `${devLog.colors.greenBright("?")} ${devLog.colors.whiteBright(
      confirmationMessage,
    )} ${devLog.colors.gray(defaultValue ? "(Y/n)" : "(N/y)")} `;
    rl.question(question, (answer) => {
      rl.close();
      answer = (answer || "").trim();
      const confirm = /^[yY]/.test(answer || (defaultValue ? "Y" : "N"));
      console.log(confirm ? devLog.colors.greenBright("  Yes") : devLog.colors.redBright("  No"));
      console.log();
      resolve(confirm);
    });
  });
}

let _spinStack: { title: string }[] | null = null;
let _spinInterval: IntervalType | null = null;
let _spinCounter = 0;
let _spinLastWritten: number = 0;

const _spinnerDraw = () => {
  const entry = _spinStack![_spinStack!.length - 1];
  if (entry) {
    try {
      const t = entry.title;
      const chars = startSpinner.chars;
      const text = `\r${devLog.colors.blueBright(chars[_spinCounter++ % chars.length])} ${t}${devLog.colors.blackBright(
        " … ",
      )}`;
      _spinLastWritten = t.length;
      process.stdout.write(text);
    } catch {}
  }
};

/** Starts a spinner. */

function startSpinner(title: string = ""): () => void {
  if (!devLog.isTerm()) {
    return noop;
  }

  if (_spinStack === null) {
    _spinStack = [];
  }

  let entry: { title: string } | null = { title };

  _spinStack.push(entry);

  if (!_spinInterval) {
    _spinInterval = setInterval(_spinnerDraw, 100).unref();
  }
  _spinCounter = 0;

  const t = (_spinStack![_spinStack!.length - 1] || entry).title;
  const s = `\r${devLog.colors.blueBright("⠿")} ${t}${devLog.colors.blackBright(" … ")}`;
  _spinLastWritten = t.length;
  process.stdout.write(s);

  return () => {
    const removed = entry;
    if (removed !== null) {
      entry = null;
      const index = _spinStack!.indexOf(removed);
      if (index >= 0) {
        _spinStack!.splice(index, 1);
      }
      _spinnerRemoved();
    }
  };
}

function _spinnerRemoved() {
  try {
    if (_spinStack!.length === 0 && _spinInterval) {
      clearInterval(_spinInterval);
      _spinInterval = null;
    }
    process.stdout.write(devLog.isTerm() ? `\r${" ".repeat(_spinLastWritten + 5)}\r` : "\n");
  } catch {}
}

startSpinner.pop = () => {
  if (_spinStack !== null && _spinStack.length !== 0) {
    _spinStack.pop();
    _spinnerRemoved();
  }
};

startSpinner.chars = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

interface TitledOptions {
  title: string;
  titlePaddingWidth?: number | undefined;
}

function titled(title: string, ...args: unknown[]): void;

function titled(
  options: {
    title: string;
    titlePaddingWidth?: number | undefined;
  },
  ...args: unknown[]
): void;

function titled(titleOrOptions: string | TitledOptions, ...args: unknown[]): void {
  let title: string;
  let titlePaddingWidth: number;
  if (typeof titleOrOptions === "object") {
    title = titleOrOptions.title;
    titlePaddingWidth = (titleOrOptions.titlePaddingWidth ?? devLog.options.titlePaddingWidth) || 0;
  } else {
    title = titleOrOptions;
    titlePaddingWidth = devLog.options.titlePaddingWidth || 0;
  }
  if (titlePaddingWidth > 0) {
    title = title.padEnd(titlePaddingWidth, " ");
  }
  devLog.log(devLog.colors.cyan(`${devLog.colors.blueBright("·")} ${title}`), ...args);
}

/** Prints how much time it takes to run something */
function timed<T>(
  title: string,
  fnOrPromise: ((ctx: DevLogTimedContext) => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimedOptions | undefined,
): Promise<Awaited<T>>;

/** Prints how much time it takes to run something */
function timed<T>(
  title: string,
  fnOrPromise: null | undefined | ((ctx: DevLogTimedContext) => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimedOptions | undefined,
): Promise<null | undefined | T>;

async function timed(title: unknown, fnOrPromise: unknown, options: DevLogTimedOptions = {}) {
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
      fnOrPromise = fnOrPromise(new DevLogTimedContext(_timed));
    }
    const result = await fnOrPromise;
    _timed.end();
    return result;
  } catch (e) {
    _timed.fail(e);
    throw e;
  }
}

timed.wrap = function timed_wrap<R>(
  title: string,
  fn: (ctx: DevLogTimedContext) => R,
  options?: DevLogTimedOptions | undefined,
) {
  return () => timed(title, fn, options);
};

timed.sync = timedSync;

function timedSync<R>(title: string, fnOrValue: (ctx: DevLogTimedContext) => R, options: DevLogTimedOptions = {}): R {
  if (!title) {
    title = fnOrValue.name;
  }
  const _timed = new DevLogTimed(`${title}`, options);
  try {
    _timed.start();
    if (title && !fnOrValue.name) {
      Reflect.defineProperty(fnOrValue, "name", { value: title, configurable: true });
    }
    const result = fnOrValue(new DevLogTimedContext(_timed));
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
  options?: DevLogTimedOptions | undefined,
): () => R {
  return () => timedSync<R>(title, fn, options);
};

export interface LogExceptionOptions {
  showStack?: boolean | "once" | undefined;
  abortErrorIsWarning?: boolean | undefined;
}

export interface DevLogTimedOptions extends LogExceptionOptions {
  printStarted?: boolean | undefined;
  logError?: boolean | undefined;
  timed?: boolean | undefined;
  elapsed?: number | undefined;
  spinner?: boolean | undefined;
  titlePaddingWidth?: number | undefined;
  successText?: string;
}

export class DevLogTimed extends ElapsedTime {
  public title: string;
  public status: Deferred.Status = "starting";
  public options: DevLogTimedOptions;
  public successText: string;

  private _stopSpinner = noop;

  constructor(title: string, options: DevLogTimedOptions = {}) {
    super(performance.now() + (options.elapsed ? +options.elapsed : 0));
    this.title = title;
    this.options = options;
    this.successText = options.successText || "";
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

  public end(text: string | undefined = this.successText): void {
    if (this.status === "pending" || this.status === "starting") {
      this._stopSpinner();
      this.stop();
      this.status = "succeeded";
      devLog.logOperationSuccess(this.title, this.options, this.elapsed, text);
    }
  }

  public fail<TError = unknown>(reason: TError): TError {
    if (this.status === "pending" || this.status === "starting") {
      this.status = "rejected";
      this._stopSpinner();
      this.stop();
      devLog.logOperationError(this.title, reason, this.options, this.elapsed);
    }
    return reason;
  }

  public override toString(): string {
    return `${this.title}: ${ElapsedTime.millisecondsToString(this.elapsed)}`;
  }
}

const private_devLogTimed = Symbol("devLogTimed");

export class DevLogTimedContext {
  private [private_devLogTimed]: DevLogTimed;

  public constructor(t: DevLogTimed) {
    this[private_devLogTimed] = t;
  }

  public get options(): DevLogTimedOptions {
    return this[private_devLogTimed].options;
  }

  public get successText(): string {
    return this[private_devLogTimed].successText;
  }

  public set successText(value: string | null | undefined) {
    this[private_devLogTimed].successText = value || "";
  }

  public get elapsed(): number {
    return this[private_devLogTimed].elapsed;
  }

  public get isRunning(): boolean {
    return this[private_devLogTimed].isRunning;
  }

  /** True if completed, with or without errors */
  public get isSettled() {
    return this[private_devLogTimed].isSettled;
  }

  /** True if completed without errors */
  public get isSucceeded() {
    return this[private_devLogTimed].isSucceeded;
  }

  /** True if failed */
  public get isRejected() {
    return this[private_devLogTimed].isRejected;
  }

  public getElapsedTime(): string {
    return this[private_devLogTimed].getElapsedTime();
  }

  public toJSON(): string {
    return this[private_devLogTimed].toJSON();
  }

  public [util.inspect.custom](): string {
    return this[private_devLogTimed][util.inspect.custom]();
  }

  public toString(): string {
    return this[private_devLogTimed].toString();
  }
}

function _devInspectForLogging(args: unknown[], prefix: string): string {
  if (args.length === 0) {
    return "";
  }
  let result = prefix;
  for (let i = 0, len = args.length; i < len; ++i) {
    if (i !== 0) {
      result += " ";
    }
    const what = args[i];
    if (typeof what === "string") {
      if (i === 0 && prefix) {
        const newLines = what.match(/^\n+/g);
        if (newLines) {
          const nl = newLines[0] || "";
          result = nl + prefix + what.slice(nl.length);
        } else {
          result += what;
        }
      } else {
        result += what;
      }
    } else {
      result += devLog.inspect(what);
    }
  }
  return result;
}

devLog.timed("hello", async (t) => {
  await require("timers/promises").setTimeout(1000);
  t.successText = "success text!";
});
