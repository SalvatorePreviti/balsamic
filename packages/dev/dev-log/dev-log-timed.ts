import util from "node:util";
import { setImmediate as asyncSetImmediate, setTimeout as asyncSetTimeout } from "node:timers/promises";
import { performance } from "perf_hooks";
import { devLog as _devLog } from "./dev-log";
import { ElapsedTime } from "../elapsed-time";
import { noop } from "../utils/utils";
import type { Deferred } from "../promises/deferred";
import type { TimerOptions } from "node:timers";
import type { LogExceptionOptions, DevLog } from "./dev-log";
import { devError } from "../dev-error";

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
  public devLog: DevLog;

  private _stopSpinner = noop;

  constructor(title: string, options: DevLogTimedOptions = {}, devLog: DevLog = _devLog) {
    super(performance.now() + (options.elapsed ? +options.elapsed : 0));
    this.title = title;
    this.options = options;
    this.successText = options.successText || "";
    this.devLog = devLog;
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
        this._stopSpinner = this.devLog.startSpinner(this.title);
      } else {
        this.devLog.logOperationStart(this.title, this.options);
      }
    }
    return this;
  }

  public end(text: string | undefined = this.successText): void {
    if (this.status === "pending" || this.status === "starting") {
      this._stopSpinner();
      this.stop();
      this.status = "succeeded";
      this.devLog.logOperationSuccess(this.title, this.options, this.elapsed, text);
    }
  }

  public fail<TError = unknown>(reason: TError): TError {
    if (this.status === "pending" || this.status === "starting") {
      this.status = "rejected";
      this._stopSpinner();
      this.stop();
      this.devLog.logOperationError(this.title, reason, this.options, this.elapsed);
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

  public error: Error | string | undefined | null = undefined;
  public pendingPromises: (Promise<void> | Promise<unknown> | (() => Promise<void> | Promise<unknown>))[] = [];

  public constructor(t: DevLogTimed) {
    this[private_devLogTimed] = t;
  }

  public get devLog(): DevLog {
    return this[private_devLogTimed].devLog;
  }

  public get title(): string {
    return this[private_devLogTimed].title;
  }

  public set title(value: string) {
    this[private_devLogTimed].title = value;
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

  public setTimeout<T = void>(
    delay?: number | undefined,
    value?: T | undefined,
    options?: TimerOptions | undefined,
  ): Promise<T> {
    return this.addPendingPromise(asyncSetTimeout(delay, value, options));
  }

  public setImmediate<T = void>(value?: T, options?: TimerOptions | undefined): Promise<T> {
    return this.addPendingPromise(asyncSetImmediate(value, options));
  }

  /** Add promises to await before exiting the timed block. */
  public addPendingPromise<
    T extends null | undefined | Promise<unknown> | Promise<void> | (() => Promise<unknown> | Promise<void>),
  >(promise: T): T {
    if (promise && (typeof promise === "function" || this.pendingPromises.indexOf(promise) < 0)) {
      this.pendingPromises.push(promise);
    }
    return promise;
  }

  /** Sets an error that wil be thrown when the timed block ends. */
  public setError(e: null | undefined | string | Error): void {
    this.error = e ? devError(e, this.setError) : undefined;
  }

  public setSuccessText(value: string | null | undefined): this {
    this.successText = value;
    return this;
  }

  public async flushPendingPromises(): Promise<void>;

  public async flushPendingPromises<T>(data: T): Promise<T>;

  public async flushPendingPromises(data?: unknown): Promise<unknown> {
    const promises = this.pendingPromises;
    for (let i = 0; i < promises.length; ++i) {
      const p = promises[i];
      if (typeof p === "function") {
        try {
          promises[i] = p();
        } catch (e) {
          promises[i] = Promise.reject(e);
        }
      }
    }
    while (this.pendingPromises.length > 0) {
      try {
        const p = this.pendingPromises.pop();
        await (typeof p === "function" ? p() : p);
      } catch (e) {
        try {
          this.devLog.logException(this.title, e, this.options);
        } catch {}
      }
    }
    return data;
  }
}
