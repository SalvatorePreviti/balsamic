import util from "util";
import readline from "readline";
import { colors as _colors } from "../colors";
import { millisecondsToString } from "../lib/utils";
import { devEnv } from "../dev-env";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import type { ChalkFunction } from "chalk";

export { ChalkFunction };

const _noColor = (s: string) => `${s}`;

let _logProcessTimeInitialized = false;
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

export namespace devLog {
  export type TermBasicColor =
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "blackBright"
    | "redBright"
    | "greenBright"
    | "yellowBright"
    | "blueBright"
    | "magentaBright"
    | "cyanBright"
    | "whiteBright";
}

export function devLog(...args: unknown[]): void {
  devLog.log(...args);
}

devLog.colors = _colors;

devLog.inspectOptions = {
  ...util.inspect.defaultOptions,
  colors: !!devLog.colors.supportsColor && devLog.colors.supportsColor.hasBasic,
  depth: Math.max(8, util.inspect.defaultOptions.depth || 0),
};

devLog.getColor = function getColor(color: ChalkFunction | devLog.TermBasicColor | null | undefined) {
  if (typeof color === "string") {
    color = devLog.colors[color];
  }
  if (typeof color === "function") {
    return color;
  }
  return _noColor;
};

devLog.log = function log(...args: unknown[]): void {
  console.log(_devInspectForLogging(args));
};

devLog.logBlack = function logBlack(...args: unknown[]) {
  devLog.log(devLog.colors.black(_devInspectForLogging(args)));
};

devLog.logRed = function logRed(...args: unknown[]) {
  devLog.log(devLog.colors.red(_devInspectForLogging(args)));
};

devLog.logGreen = function logGreen(...args: unknown[]) {
  devLog.log(devLog.colors.green(_devInspectForLogging(args)));
};

devLog.logYellow = function logYellow(...args: unknown[]) {
  devLog.log(devLog.colors.yellow(_devInspectForLogging(args)));
};

devLog.logBlue = function logBlue(...args: unknown[]) {
  devLog.log(devLog.colors.blue(_devInspectForLogging(args)));
};

devLog.logMagenta = function logMagenta(...args: unknown[]) {
  devLog.log(devLog.colors.magenta(_devInspectForLogging(args)));
};

devLog.logCyan = function logCyan(...args: unknown[]) {
  devLog.log(devLog.colors.cyan(_devInspectForLogging(args)));
};

devLog.logWhite = function logWhite(...args: unknown[]) {
  devLog.log(devLog.colors.white(_devInspectForLogging(args)));
};

devLog.logBlackBright = function logBlackBright(...args: unknown[]) {
  devLog.log(devLog.colors.blackBright(_devInspectForLogging(args)));
};

devLog.logRedBright = function logRedBright(...args: unknown[]) {
  devLog.log(devLog.colors.redBright(_devInspectForLogging(args)));
};

devLog.logGreenBright = function logGreenBright(...args: unknown[]) {
  devLog.log(devLog.colors.greenBright(_devInspectForLogging(args)));
};

devLog.logYellowBright = function logYellowBright(...args: unknown[]) {
  devLog.log(devLog.colors.yellowBright(_devInspectForLogging(args)));
};

devLog.logBlueBright = function logBlueBright(...args: unknown[]) {
  devLog.log(devLog.colors.blueBright(_devInspectForLogging(args)));
};
devLog.logMagentaBright = function logMagentaBright(...args: unknown[]) {
  devLog.log(devLog.colors.magentaBright(_devInspectForLogging(args)));
};

devLog.logCyanBright = function logCyanBright(...args: unknown[]) {
  devLog.log(devLog.colors.cyanBright(_devInspectForLogging(args)));
};

devLog.logWhiteBright = function logWhiteBright(...args: unknown[]) {
  devLog.log(devLog.colors.whiteBright(_devInspectForLogging(args)));
};

devLog.logColor = function logColor(color: devLog.TermBasicColor, ...args: unknown[]) {
  devLog.log(devLog.colors[color](_devInspectForLogging(args)));
};

devLog.error = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.error();
  } else {
    console.error(devLog.colors.redBright(`❌ ${devLog.colors.underline("ERROR")}: ${_devInspectForLogging(args)}`));
  }
};

devLog.logException = function logException(
  message: string | undefined,
  error: unknown,
  options: LogExceptionOptions = {},
): void {
  let err;
  let isAbortError = false;
  let isOk = false;

  if (error instanceof Error) {
    isAbortError = AbortError.isAbortError(error);
    isOk = isAbortError && error.isOk === true;

    err = devLog.inspectException(error, options);
    if (err.includes("\n") && !err.endsWith("\n\n")) {
      err += "\n";
    }
  } else {
    err = error;
  }

  if (message) {
    if (isAbortError) {
      if (isOk) {
        devLog.info(message, err);
      } else if (options.abortErrorIsWarning ?? devLog.abortErrorIsWarning) {
        devLog.warn(message, err);
      } else {
        devLog.error(message, err);
      }
    } else {
      devLog.error(message, err);
    }
  } else if (isAbortError) {
    if (isOk) {
      devLog.info(err);
    } else if (options.abortErrorIsWarning ?? devLog.abortErrorIsWarning) {
      devLog.warn(err);
    } else {
      devLog.error(err);
    }
  } else {
    devLog.error(err);
  }
};

devLog.inspectException = (error: Error, options: LogExceptionOptions = {}): string => {
  const showStack = errorShouldShowStack(error, options);

  if (showStack) {
    const inspected = devLog.inspect(error) || `${error}`;
    return showStack !== "once" || _inspectedErrorLoggedSet_add(error.stack) ? inspected : `${error}`;
  }

  return `${error}`;
};

function errorShouldShowStack(error: Error, options: LogExceptionOptions = {}): boolean | "once" {
  let showStack: boolean | "once" | undefined;

  const errorShowStack = error.showStack;
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
    showStack = devLog.defaultShowStack;
  }

  return showStack;
}

/** Default on wether abort errors are treated as warnings or not */
devLog.abortErrorIsWarning = true;

/** Default option on how stack trace should be shown */
devLog.defaultShowStack = "once" as boolean | "once";

devLog.printProcessBanner = function printProcessBanner() {
  const processTitle = devEnv.getProcessTitle();
  if (processTitle) {
    devLog.log(`${devLog.colors.blueBright("\n⬢")} ${devLog.colors.rgb(100, 200, 255)(processTitle)}\n`);
  }
};

/** Developer debug log. Appends the line where this function was called. */
devLog.dev = function (...args: unknown[]): void {
  const oldStackTraceLimit = Error.stackTraceLimit;
  const err: { stack?: string } = {};
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
    devLog.colors.blueBright(`${devLog.colors.underline("DEV")}: `) +
      devLog.colors.blueBright(_devInspectForLogging(args)) +
      (devLine ? `\n     ${devLog.colors.blueBright(devLine)}` : ""),
  );
};

devLog.warn = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.warn();
  } else {
    console.warn(
      devLog.colors.rgb(
        200,
        200,
        50,
      )(`${devLog.colors.yellowBright(`⚠️  ${devLog.colors.underline("WARNING")}:`)} ${_devInspectForLogging(args)}`),
    );
  }
};

devLog.info = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.info();
  } else {
    console.info(
      devLog.colors.cyan(
        `${devLog.colors.cyanBright(`ℹ️  ${devLog.colors.underline("INFO")}:`)} ${_devInspectForLogging(args)}`,
      ),
    );
  }
};

devLog.inspect = function (what: unknown): string {
  if (what instanceof Error) {
    if (what.showStack === false) {
      return `${what}`;
    }
    what = devError(what, devLog.inspect);
  }
  return util.inspect(what, devLog.inspectOptions);
};

/** Attach an handler that will log process duration when the process terminates. */
devLog.initProcessTime = function () {
  if (_logProcessTimeInitialized) {
    return false;
  }
  _logProcessTimeInitialized = true;
  const handleExit = () => {
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
  };
  process.once("exit", handleExit);
  return true;
};

/** Prints an horizontal line */
devLog.hr = function hr(color?: ChalkFunction | devLog.TermBasicColor, char = "⎯") {
  let columns = 10;

  if (devLog.colors.level < 1 || !process.stdout.isTTY) {
    devLog.log("-".repeat(10));
    return;
  }

  if (devLog.colors.level > 1 && process.stdout.isTTY && columns) {
    columns = process.stdout.columns;
  }
  if (columns > 250) {
    columns = 250;
  }

  devLog.log(devLog.getColor(color)(char.repeat(columns)));
};

export interface LogExceptionOptions {
  showStack?: boolean | "once";
  abortErrorIsWarning?: boolean;
}

export interface DevLogTimeOptions extends LogExceptionOptions {
  printStarted?: boolean;
  logError?: boolean;
  timed?: boolean;
}

/** Prints how much time it takes to run something */
async function timed<T>(
  title: string,
  fnOrPromise: (() => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimeOptions,
): Promise<Awaited<T>>;

/** Prints how much time it takes to run something */
async function timed<T>(
  title: string,
  fnOrPromise: null | undefined | (() => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimeOptions,
): Promise<null | undefined | T>;

async function timed(title: unknown, fnOrPromise: unknown, options: DevLogTimeOptions = {}) {
  if (fnOrPromise === null || (typeof fnOrPromise !== "object" && typeof fnOrPromise !== "function")) {
    return fnOrPromise;
  }
  if (typeof fnOrPromise === "object" && typeof (fnOrPromise as any).then !== "function") {
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
  } catch (error) {
    _timed.fail(error);
    throw error;
  }
}

devLog.timed = timed;

export class DevLogTimed {
  public options: DevLogTimeOptions;
  public status: "pending" | "started" | "succeeded" | "failed" = "pending";
  #starTime: number;

  constructor(public title: string, options: DevLogTimeOptions = {}) {
    this.options = options;
    this.#starTime = performance.now();
  }

  public start(): this {
    if (this.status !== "pending") {
      return this;
    }
    this.status = "started";
    devLog.logOperationStart(this.title, this.options);
    this.#starTime = performance.now();
    return this;
  }

  public get elapsed(): number {
    return performance.now() - this.#starTime;
  }

  public getElapsedTime(): string {
    return millisecondsToString(performance.now() - this.#starTime);
  }

  public end(): void {
    if (this.status !== "pending" && this.status !== "started") {
      return;
    }
    this.status = "succeeded";
    devLog.logOperationSuccess(this.title, this.options, this.elapsed);
  }

  public fail<TError = unknown>(error: TError): TError {
    if (this.status !== "pending" && this.status !== "started") {
      return error;
    }
    this.status = "failed";
    devLog.logOperationError(this.title, error, this.options, this.elapsed);
    return error;
  }
}

devLog.logOperationStart = function logOperationStart(
  title: string,
  options: DevLogTimeOptions = { printStarted: true },
) {
  let { timed: isTimed, printStarted } = options;
  if (isTimed === undefined) {
    isTimed = true;
  }
  if (printStarted === undefined) {
    printStarted = isTimed;
  }
  if (printStarted) {
    devLog.log(devLog.colors.cyan(`${devLog.colors.cyan("◆")} ${title}`) + devLog.colors.gray(" started..."));
  }
};

devLog.logOperationSuccess = function logOperationSuccess(
  title: string,
  options: DevLogTimeOptions = { printStarted: true },
  elapsed?: number,
) {
  let { timed: isTimed, printStarted } = options;
  if (isTimed === undefined) {
    isTimed = !!elapsed;
  }
  if (printStarted === undefined) {
    printStarted = isTimed;
  }
  if (isTimed || printStarted) {
    let msg = `${printStarted ? "\n" : ""}${devLog.colors.green("✔")} ${title} ${devLog.colors.bold("OK")}`;
    if (elapsed && (isTimed || elapsed > 5)) {
      msg += ` in ${millisecondsToString(elapsed)}`;
    }
    msg += ".";
    devLog.log(devLog.colors.green(msg));
  }
};

devLog.logOperationError = function logOperationError(
  title: string,
  error: unknown,
  options: DevLogTimeOptions = { logError: true },
  elapsed?: number,
) {
  let { timed: isTimed, logError } = options;
  if (logError === undefined) {
    logError = true;
  }
  if (logError) {
    if (isTimed === undefined) {
      isTimed = !!elapsed;
    }

    const isAbortError = AbortError.isAbortError(error);

    const message = `${title} ${isAbortError ? "aborted" : "FAILED"}${
      elapsed && (isTimed || elapsed > 5) ? ` in ${millisecondsToString(elapsed)}` : ""
    }.`;

    if (options.showStack === undefined && isAbortError) {
      options = { ...options, showStack: false };
    }

    devLog.logException(message, error, options);
  }
};

/** Asks the user to input Yes or No */
devLog.askConfirmation = async function askConfirmation(message: string, defaultValue: boolean) {
  if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
    return true;
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface(process.stdin, process.stdout as any);
    const question = `${devLog.colors.greenBright("?")} ${devLog.colors.whiteBright(message)} ${devLog.colors.gray(
      defaultValue ? "(Y/n)" : "(N/y)",
    )} `;
    rl.question(question, (answer) => {
      rl.close();
      answer = (answer || "").trim();
      const confirm = /^[yY]/.test(answer || (defaultValue ? "Y" : "N"));
      console.log(confirm ? devLog.colors.greenBright("  Yes") : devLog.colors.redBright("  No"));
      console.log();
      resolve(confirm);
    });
  });
};

function _devInspectForLogging(args: unknown[]) {
  return args.map((what) => (typeof what === "string" ? what : devLog.inspect(what))).join(" ");
}
