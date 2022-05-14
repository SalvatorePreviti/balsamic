import readline from "node:readline";
import { millisecondsToString } from "../elapsed-time";
import { devError } from "../dev-error";
import { AbortError } from "../promises/abort-error";
import type { IntervalType, UnsafeAny } from "../types";
import { noop } from "../utils/utils";
import { devEnv } from "../dev-env";
import { DevLogTimed, DevLogTimedContext } from "./dev-log-timed";
import type { DevLogTimedOptions } from "./dev-log-timed";
import { DevLogStream } from "./dev-log-stream";

const _inspectedErrorLoggedSet_maxSize = 32;
const _inspectedErrorLoggedSet = new Set<unknown>();

export interface LogExceptionOptions {
  showStack?: boolean | "once" | undefined;
  abortErrorIsWarning?: boolean | undefined;
}

export namespace DevLog {
  export interface TitledOptions {
    title: string;
    titlePaddingWidth?: number | undefined;
  }
}

export type devLog = DevLog;

export let devLog: DevLog;

const CHARS = {
  VBLOCKS: "▁▂▃▄▅▆▇█",
  HBLOCKS: "▏▎▍▌▋▊▉█",
  SPINNER: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏",

  DOT: "∙",
  ELLIPSIS: "…",

  CIRCLE: "●",
  SQUARE: "■",
  DIAMOND: "◆",
  STAR: "★",
  TRIANGLE_UP: "▲",
  TRIANGLE_DOWN: "▼",
  TRIANGLE_LEFT: "◀",
  TRIANGLE_RIGHT: "▶",

  BLOCK: "█",

  ERROR: "❌",
  WARN: "⚠️ ",
  INFO: "ℹ️ ",
  DEBUG: "🐛",
  VERBOSE: "📖",
  CHECK: "✔",
};

export class DevLog extends DevLogStream {
  public stderr: DevLogStream;

  public CHARS = CHARS;

  public options = {
    /** Default option on how stack trace should be shown */
    showStack: "once" as boolean | "once",

    /** Default on wether abort errors are treated as warnings or not */
    abortErrorIsWarning: true,

    titlePaddingWidth: 0,
  };

  /** Starts a spinner. */
  public startSpinner: (title?: string | undefined) => () => void;

  public static get instance(): DevLog {
    return devLog;
  }

  public static set instance(value: DevLog) {
    devLog = value;
  }

  public get stdout(): DevLogStream {
    return this;
  }

  public constructor(stdout = process.stdout, stderr = process.stderr) {
    super(stdout, devEnv.colorsLevel > 0);

    this.stderr = new DevLogStream(stderr, devEnv.stderrColorsLevel > 0);

    let _spinStack: { title: string }[] | null = null;
    let _spinInterval: IntervalType | null = null;
    let _spinCounter = 0;

    const _spinnerDraw = () => {
      const entry = _spinStack![_spinStack!.length - 1];
      if (entry) {
        try {
          const t = entry.title;
          const s = this.CHARS.SPINNER;
          const text = `\r${this.colors.blueBright(s[_spinCounter++ % s.length])} ${t}${this.colors.blackBright(
            " … ",
          )}`;
          this.write(text);
        } catch {}
      }
    };

    const startSpinner = (title: string = ""): (() => void) => {
      if (!this.isTerm) {
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

      const t = (_spinStack[_spinStack.length - 1] || entry).title;
      const s = `\r${this.colors.blueBright("⠿")} ${t}${this.colors.blackBright(" … ")}`;
      this.write(s);

      return () => {
        const removed = entry;
        if (removed !== null) {
          entry = null;
          const index = _spinStack!.indexOf(removed);
          if (index >= 0) {
            _spinStack!.splice(index, 1);
          }
          if (_spinStack!.length === 0 && _spinInterval) {
            clearInterval(_spinInterval);
            _spinInterval = null;
          }
          try {
            if (this.isTerm) {
              this.stream.clearLine(-1);
              this.write("\r");
            } else {
              this.write("\n");
            }
          } catch {}
        }
      };
    };

    this.startSpinner = startSpinner;
  }

  public error(...args: unknown[]): void {
    this.stderr.writeln(
      this.colors.redBright(
        this.stderr.inspectArgs(args, `${this.CHARS.ERROR} ${this.stderr.colors.underline("ERROR")}: `),
      ),
    );
  }

  public critical(...args: unknown[]): void {
    this.stderr.writeln(
      this.colors.redBright(
        this.stderr.inspectArgs(args, `${this.CHARS.ERROR} ${this.stderr.colors.underline("CRITICAL")}: `),
      ),
    );
  }

  public warn(...args: unknown[]): void {
    this.stderr.writeln(
      this.colors.yellow(
        this.inspectArgs(
          args,
          `${this.colors.yellowBright(`${this.CHARS.WARN} ${this.colors.underline("WARNING")}:`)} `,
        ),
      ),
    );
  }

  public info(...args: unknown[]): void {
    this.writeln(
      this.colors.cyan(this.inspectArgs(args, `${this.CHARS.INFO} ${this.colors.cyanBright.underline("INFO")}: `)),
    );
  }

  public debug(...args: unknown[]): void {
    this.writeln(
      this.colors.blueBright(this.inspectArgs(args, `${this.CHARS.DEBUG} ${this.colors.underline("DEBUG")}: `)),
    );
  }

  public verbose(...args: unknown[]): void {
    this.writeln(
      this.colors.magenta(
        this.inspectArgs(args, `${this.CHARS.VERBOSE} ${this.colors.magentaBright.underline("VERBOSE")}: `),
      ),
    );
  }

  public notice(...args: unknown[]): void {
    this.writeln(this.getColor("notice")(this.inspectArgs(args, "⬢ ")));
  }

  public emit(
    severity: "critical" | 3 | "error" | 2 | "warning" | 1 | "info" | 0 | "debug" | "verbose" | "notice",
    ...args: unknown[]
  ): void {
    switch (severity) {
      case 3:
      case "critical":
        this.critical(...args);
        break;
      case 2:
      case "error":
        this.error(...args);
        break;
      case 1:
      case "warning":
        this.warn(...args);
        break;
      case 0:
      case "info":
        this.info(...args);
        break;
      case "debug":
        this.debug(...args);
        break;
      case "verbose":
        this.verbose(...args);
        break;
      case "notice":
        this.notice(...args);
        break;
      default:
        this.log(...args);
        break;
    }
  }

  /** Asks the user to input Yes or No */
  public askConfirmation(confirmationMessage: string, defaultValue: boolean) {
    if (!process.stdin || !this.isTerm) {
      return true;
    }
    return new Promise((resolve) => {
      const rl = readline.createInterface(process.stdin, this.stream as UnsafeAny);
      const question = `${this.colors.greenBright("?")} ${this.colors.whiteBright(
        confirmationMessage,
      )} ${this.colors.gray(defaultValue ? "(Y/n)" : "(N/y)")} `;
      rl.question(question, (answer) => {
        rl.close();
        answer = (answer || "").trim();
        const confirm = /^[yY]/.test(answer || (defaultValue ? "Y" : "N"));
        console.log(confirm ? this.colors.greenBright("  Yes") : this.colors.redBright("  No"));
        console.log();
        resolve(confirm);
      });
    });
  }

  public logException(logMessage: string | undefined, exception: unknown, options: LogExceptionOptions = {}): void {
    let err;
    let isAbortError = false;
    let isOk = false;

    if (exception instanceof Error) {
      isAbortError = AbortError.isAbortError(exception);
      isOk = isAbortError && exception.isOk === true;

      err = this.inspectException(exception, options);
      if (err.includes("\n") && !err.endsWith("\n\n")) {
        err += "\n";
      }
    } else {
      err = exception;
    }

    if (logMessage) {
      if (isAbortError) {
        if (isOk) {
          this.info(logMessage, err);
        } else if (options.abortErrorIsWarning ?? this.options.abortErrorIsWarning) {
          if (err === "AbortError: The operation was aborted") {
            this.warn(logMessage);
          } else {
            this.warn(logMessage, err);
          }
        } else {
          this.error(logMessage, err);
        }
      } else {
        this.error(logMessage, err);
      }
    } else if (isAbortError) {
      if (isOk) {
        this.info(err);
      } else if (options.abortErrorIsWarning ?? this.options.abortErrorIsWarning) {
        this.warn(err);
      } else {
        this.error(err);
      }
    } else {
      this.error(err);
    }
  }

  public inspectException(exception: Error, options: LogExceptionOptions = {}): string {
    exception = devError(exception);

    const showStack = this.errorShouldShowStack(exception, options);

    if (showStack) {
      const inspected = this.inspect(exception) || `${exception}`;
      return showStack !== "once" || _inspectedErrorLoggedSet_add(exception.stack) ? inspected : `${exception}`;
    }

    return `${exception}`;
  }

  public errorShouldShowStack(exception: Error, options: LogExceptionOptions = {}): boolean | "once" {
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
      showStack = this.options.showStack;
    }

    return showStack;
  }

  public logOperationStart(title: string, options: DevLogTimedOptions = { printStarted: true }) {
    let { timed: isTimed, printStarted } = options;
    if (isTimed === undefined) {
      isTimed = true;
    }
    if (printStarted === undefined) {
      printStarted = isTimed;
    }
    if (printStarted) {
      const titlePaddingWidth = (options.titlePaddingWidth ?? this.options.titlePaddingWidth) || 0;
      if (titlePaddingWidth > 0) {
        title = title.padEnd(titlePaddingWidth, " ");
      }
      this.log(this.colors.cyan(`${this.colors.cyan("◆")} ${title}`) + this.colors.gray(" started..."));
    }
  }

  public logOperationSuccess(
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
      const titlePaddingWidth = (options.titlePaddingWidth ?? this.options.titlePaddingWidth) || 0;
      if (titlePaddingWidth > 0) {
        title = title.padEnd(titlePaddingWidth, " ");
      }
      let msg = `${printStarted && !spinner ? "\n" : ""}${this.colors.greenBright("✔")} ${title} ${this.colors.bold(
        "OK",
      )}`;

      if (elapsed && (isTimed || elapsed > 5 || titlePaddingWidth)) {
        if (titlePaddingWidth) {
          msg += `.${this.colors.blueBright(` ${millisecondsToString(elapsed, { fixed: "s" })}`)}`;
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
        msg += this.getColor("notice")(successText);
      }
      this.log(this.colors.green(msg));
    }
  }

  public logOperationError(
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

      this.logException(msg, exception, options);
    }
  }

  public titled(title: string, ...args: unknown[]): void;

  public titled(options: DevLog.TitledOptions, ...args: unknown[]): void;

  public titled(titleOrOptions: string | DevLog.TitledOptions, ...args: unknown[]): void {
    let title: string;
    let titlePaddingWidth: number;
    if (typeof titleOrOptions === "object") {
      title = titleOrOptions.title;
      titlePaddingWidth = (titleOrOptions.titlePaddingWidth ?? this.options.titlePaddingWidth) || 0;
    } else {
      title = titleOrOptions;
      titlePaddingWidth = this.options.titlePaddingWidth || 0;
    }
    if (titlePaddingWidth > 0) {
      title = title.padEnd(titlePaddingWidth, " ");
    }
    this.log(this.colors.cyan(`${this.colors.blueBright("·")} ${title}`), ...args);
  }

  public timed<R = unknown>(
    title: string,
    fnOrPromise: ((this: DevLogTimedContext, ctx: DevLogTimedContext) => R) | R,
    options?: DevLogTimedOptions,
  ): R;

  public timed<R = unknown>(
    fnOrPromise: ((this: DevLogTimedContext, ctx: DevLogTimedContext) => R) | R,
    options?: DevLogTimedOptions & { title?: string | undefined },
  ): R;

  public timed<R = unknown>(
    title: unknown,
    fnOrPromise: ((this: DevLogTimedContext, ctx: DevLogTimedContext) => R) | R | DevLogTimedOptions,
    options?: DevLogTimedOptions & { title?: string },
  ): unknown {
    if (typeof title !== "string" && options === undefined) {
      options = fnOrPromise as DevLogTimedOptions;
      fnOrPromise = title as UnsafeAny;
      title = options?.title;
    }

    if (fnOrPromise === null || (typeof fnOrPromise !== "object" && typeof fnOrPromise !== "function")) {
      return fnOrPromise;
    }
    if (typeof fnOrPromise === "object" && typeof (fnOrPromise as Promise<unknown>).then !== "function") {
      return fnOrPromise as R;
    }
    if (!title && typeof fnOrPromise === "function") {
      title = fnOrPromise.name;
      title = typeof title === "string" ? title.replaceAll("_", " ") : title;
    }
    if (typeof title === "symbol") {
      title = title.toString();
    }
    if (!title) {
      title = "<anonymous>";
    }

    title = `${title}`;

    const _timed = new DevLogTimed(title as string, options);

    try {
      const context = new DevLogTimedContext(_timed);
      _timed.start();
      if (typeof fnOrPromise === "function") {
        if (title && title !== "<anonymous>" && !fnOrPromise.name) {
          Reflect.defineProperty(fnOrPromise, "name", { value: title, configurable: true });
        }
        fnOrPromise = (fnOrPromise as Function).call(context, context);
      }

      const timedEnd = (data: unknown): unknown => {
        if (context.pendingPromises.length > 0) {
          return context.flushPendingPromises(data).then(timedEnd);
        }
        if (context.error) {
          throw devError(context.error);
        }
        _timed.end();
        return data;
      };

      const timedError = (e: unknown): unknown => {
        if (context.pendingPromises.length > 0) {
          return context.flushPendingPromises(e).then(timedError, timedError);
        }
        _timed.fail(e);
        return Promise.reject(e);
      };

      if (
        typeof fnOrPromise === "object" &&
        fnOrPromise !== null &&
        typeof (fnOrPromise as Promise<unknown>).then === "function"
      ) {
        return typeof (fnOrPromise as Promise<unknown>).catch === "function"
          ? (fnOrPromise as Promise<unknown>).then(timedEnd).catch(timedError)
          : (fnOrPromise as Promise<unknown>).then(timedEnd, timedError);
      }

      if (context.pendingPromises.length > 0) {
        context.flushPendingPromises(fnOrPromise).then(timedEnd).catch(timedError);
      } else {
        if (context.error) {
          throw devError(context.error);
        }
        _timed.end();
      }

      return fnOrPromise as R;
    } catch (e) {
      _timed.fail(e);
      throw e;
    }
  }

  public timed_wrap<R>(
    title: string,
    fn: (this: DevLogTimedContext, ctx: DevLogTimedContext) => R,
    options?: DevLogTimedOptions | undefined,
  ) {
    return () => this.timed(title, fn, options);
  }
}

devLog = new DevLog();

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

devLog.error("err");
devLog.info("info");
devLog.warn("warn");
devLog.debug("debug");
devLog.verbose("verbose");
