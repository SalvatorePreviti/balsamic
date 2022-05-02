import util from "util";
import readline from "readline";
import { colors as _colors, colors_disabled } from "../colors";
import { millisecondsToString } from "../utils/utils";
import { devEnv } from "../dev-env";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import { performance } from "perf_hooks";
import type { Chalk, ChalkFunction } from "chalk";
import type { Deferred } from "../promises/deferred";

export { ChalkFunction };

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

export function devLog(...args: unknown[]): void {
  devLog.log(...args);
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

  export function getColor(color: Chalk | devLog.TermBasicColor | "error" | "warning" | "info" | null | undefined) {
    if (typeof color === "string") {
      switch (color) {
        case "error":
          return _colors.redBright;
        case "warning":
          return _colors.yellowBright;
        case "info":
          return _colors.blueBright;
      }
      color = devLog.colors[color];
    }
    return typeof color === "function" ? color : colors_disabled;
  }

  export function log(...args: unknown[]): void {
    console.log(_devInspectForLogging(args));
  }

  export function logBlack(...args: unknown[]) {
    devLog.log(devLog.colors.black(_devInspectForLogging(args)));
  }

  export function logRed(...args: unknown[]) {
    devLog.log(devLog.colors.red(_devInspectForLogging(args)));
  }

  export function logGreen(...args: unknown[]) {
    devLog.log(devLog.colors.green(_devInspectForLogging(args)));
  }

  export function logYellow(...args: unknown[]) {
    devLog.log(devLog.colors.yellow(_devInspectForLogging(args)));
  }

  export function logBlue(...args: unknown[]) {
    devLog.log(devLog.colors.blue(_devInspectForLogging(args)));
  }

  export function logMagenta(...args: unknown[]) {
    devLog.log(devLog.colors.magenta(_devInspectForLogging(args)));
  }

  export function logCyan(...args: unknown[]) {
    devLog.log(devLog.colors.cyan(_devInspectForLogging(args)));
  }

  export function logWhite(...args: unknown[]) {
    devLog.log(devLog.colors.white(_devInspectForLogging(args)));
  }

  export function logBlackBright(...args: unknown[]) {
    devLog.log(devLog.colors.blackBright(_devInspectForLogging(args)));
  }

  export function logRedBright(...args: unknown[]) {
    devLog.log(devLog.colors.redBright(_devInspectForLogging(args)));
  }

  export function logGreenBright(...args: unknown[]) {
    devLog.log(devLog.colors.greenBright(_devInspectForLogging(args)));
  }

  export function logYellowBright(...args: unknown[]) {
    devLog.log(devLog.colors.yellowBright(_devInspectForLogging(args)));
  }

  export function logBlueBright(...args: unknown[]) {
    devLog.log(devLog.colors.blueBright(_devInspectForLogging(args)));
  }

  export function logMagentaBright(...args: unknown[]) {
    devLog.log(devLog.colors.magentaBright(_devInspectForLogging(args)));
  }

  export function logCyanBright(...args: unknown[]) {
    devLog.log(devLog.colors.cyanBright(_devInspectForLogging(args)));
  }

  export function logWhiteBright(...args: unknown[]) {
    devLog.log(devLog.colors.whiteBright(_devInspectForLogging(args)));
  }

  export function logColor(color: devLog.TermBasicColor, ...args: unknown[]) {
    devLog.log(devLog.colors[color](_devInspectForLogging(args)));
  }

  export function error(...args: unknown[]): void {
    if (args.length === 0) {
      console.error();
    } else {
      console.error(devLog.colors.redBright(`❌ ${devLog.colors.underline("ERROR")}: ${_devInspectForLogging(args)}`));
    }
  }

  export function logException(
    logMessage: string | undefined,
    exception: unknown,
    options: LogExceptionOptions = {},
  ): void {
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
        } else if (options.abortErrorIsWarning ?? devLog.abortErrorIsWarning) {
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
      } else if (options.abortErrorIsWarning ?? devLog.abortErrorIsWarning) {
        devLog.warn(err);
      } else {
        devLog.error(err);
      }
    } else {
      devLog.error(err);
    }
  }

  export function inspectException(exception: Error, options: LogExceptionOptions = {}): string {
    const showStack = errorShouldShowStack(exception, options);

    if (showStack) {
      const inspected = devLog.inspect(exception) || `${exception}`;
      return showStack !== "once" || _inspectedErrorLoggedSet_add(exception.stack) ? inspected : `${exception}`;
    }

    return `${exception}`;
  }

  export function errorShouldShowStack(exception: Error, options: LogExceptionOptions = {}): boolean | "once" {
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
      showStack = devLog.defaultShowStack;
    }

    return showStack;
  }

  export function printProcessBanner() {
    const processTitle = devEnv.getProcessTitle();
    if (processTitle) {
      devLog.log(`${devLog.colors.blueBright("\n⬢")} ${devLog.colors.rgb(100, 200, 255)(processTitle)}\n`);
    }
  }

  /** Developer debug log. Appends the line where this function was called. */
  export function dev(...args: unknown[]): void {
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
      devLog.colors.blueBright(`${devLog.colors.underline("DEV")}: `) +
        devLog.colors.blueBright(_devInspectForLogging(args)) +
        (devLine ? `\n     ${devLog.colors.blueBright(devLine)}` : ""),
    );
  }

  export function warn(...args: unknown[]): void {
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
  }

  export function info(...args: unknown[]): void {
    if (args.length === 0) {
      console.info();
    } else {
      console.info(
        devLog.colors.cyan(
          `${devLog.colors.cyanBright(`ℹ️  ${devLog.colors.underline("INFO")}:`)} ${_devInspectForLogging(args)}`,
        ),
      );
    }
  }

  export function debug(...args: unknown[]): void {
    if (args.length === 0) {
      console.debug();
    } else {
      console.debug(
        devLog.colors.blueBright(
          `${devLog.colors.cyanBright(`🐛  ${devLog.colors.underline("DEBUG")}:`)} ${_devInspectForLogging(args)}`,
        ),
      );
    }
  }

  export function emit(severity: "error" | 2 | "warning" | 1 | "info" | 0, ...args: unknown[]): void {
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
      default:
        devLog.log(...args);
        break;
    }
  }

  export function inspect(what: unknown): string {
    if (what instanceof Error) {
      if (what.showStack === false) {
        return `${what}`;
      }
      what = devError(what, devLog.inspect);
    }
    return util.inspect(what, devLog.inspectOptions);
  }

  /** Attach an handler that will log process duration when the process terminates. */
  export function initProcessTime() {
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
  }

  /** Prints an horizontal line */
  export function hr(
    color?: Chalk | devLog.TermBasicColor | "error" | "warning" | "info" | null | undefined,
    char = "⎯",
  ) {
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
  }

  /** Prints how much time it takes to run something */
  export async function timed<T>(
    title: string,
    fnOrPromise: (() => Promise<T> | T) | Promise<T> | T,
    options?: DevLogTimeOptions | undefined,
  ): Promise<Awaited<T>>;

  /** Prints how much time it takes to run something */
  export async function timed<T>(
    title: string,
    fnOrPromise: null | undefined | (() => Promise<T> | T) | Promise<T> | T,
    options?: DevLogTimeOptions | undefined,
  ): Promise<null | undefined | T>;

  export async function timed(title: unknown, fnOrPromise: unknown, options: DevLogTimeOptions = {}) {
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
    } catch (e) {
      _timed.fail(e);
      throw e;
    }
  }

  export function logOperationStart(title: string, options: DevLogTimeOptions = { printStarted: true }) {
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
  }

  export function logOperationSuccess(
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
      let msg = `${printStarted ? "\n" : ""}${devLog.colors.green("✔")} ${title} ${devLog.colors.bold("OK")}`;
      if (elapsed && (isTimed || elapsed > 5)) {
        msg += ` in ${millisecondsToString(elapsed)}`;
      }
      msg += ".";
      if (text) {
        msg += ` ${text}`;
      }
      devLog.log(devLog.colors.green(msg));
    }
  }

  export function logOperationError(
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

      devLog.logException(msg, exception, options);
    }
  }

  /** Asks the user to input Yes or No */
  export async function askConfirmation(confirmationMessage: string, defaultValue: boolean) {
    if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
      return true;
    }
    return new Promise((resolve) => {
      const rl = readline.createInterface(process.stdin, process.stdout as any);
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

devLog.colors = _colors;

devLog.inspectOptions = {
  ...util.inspect.defaultOptions,
  colors: !!devLog.colors.supportsColor && devLog.colors.supportsColor.hasBasic,
  depth: Math.max(8, util.inspect.defaultOptions.depth || 0),
};

/** Default on wether abort errors are treated as warnings or not */
devLog.abortErrorIsWarning = true;

/** Default option on how stack trace should be shown */
devLog.defaultShowStack = "once" as boolean | "once";

export type LogExceptionOptions = devLog.LogExceptionOptions;

export type DevLogTimeOptions = devLog.DevLogTimeOptions;

export class DevLogTimed {
  public options: DevLogTimeOptions;
  public status: Deferred.Status = "starting";
  public starTime: number;
  private _elapsed: number | null = null;

  constructor(public title: string, options: DevLogTimeOptions = {}) {
    this.options = options;
    this.starTime = performance.now() + (options.elapsed ? +options.elapsed : 0);
  }

  public start(): this {
    if (this.status !== "starting") {
      return this;
    }
    this.status = "pending";
    devLog.logOperationStart(this.title, this.options);
    return this;
  }

  public get elapsed(): number {
    return this._elapsed ?? performance.now() - this.starTime;
  }

  public getElapsedTime(): string {
    return millisecondsToString(this.elapsed);
  }

  public end(text?: string | undefined): void {
    if (this.status !== "pending" && this.status !== "starting") {
      return;
    }
    this._elapsed = this.elapsed;
    this.status = "succeeded";
    devLog.logOperationSuccess(this.title, this.options, this.elapsed, text);
  }

  public fail<TError = unknown>(error: TError): TError {
    if (this.status !== "pending" && this.status !== "starting") {
      return error;
    }
    this.status = "rejected";
    this._elapsed = this.elapsed;
    devLog.logOperationError(this.title, error, this.options, this.elapsed);
    return error;
  }

  /** True if running */
  public get isRunning() {
    return this.status === "pending" || this.status === "starting";
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
