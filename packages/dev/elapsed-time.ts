import util from "node:util";
import { performance } from "node:perf_hooks";
import { numberFixedString } from "./utils/number-fixed";

const { isArray } = Array;
const { isFinite } = Number;
const { round, floor } = Math;

/** Number of milliseconds in a nanosecond: 0.000001 */
export const MILLISECONDS_PER_NANOSECOND = 1 / 1e6;

/** Number of milliseconds in a seconds: 1 */
export const MILLISECONDS_PER_SECOND = 1000;

/** Number of milliseconds in a minute: 60000 */
export const MILLISECONDS_PER_MINUTE = 60000;

/** Number of milliseconds in an hour: 3600000 */
export const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * 60;

/** Number of milliseconds in a day: 86400000 */
export const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * 24;

/** Number of milliseconds in a week: 604800000 */
export const MILLISECONDS_PER_WEEK = MILLISECONDS_PER_DAY * 7;

/** Number of milliseconds in a month: 2628000000 */
export const MILLISECONDS_PER_MONTH = 2628000000;

/** Number of milliseconds in an average year: 31556736000 */
export const MILLISECONDS_PER_YEAR = MILLISECONDS_PER_DAY * 365.24;

/** Number of milliseconds in 365 days: 31536000000 */
export const MILLISECONDS_PER_NORMAL_YEAR = MILLISECONDS_PER_DAY * 365;

/** Number of milliseconds in 366 days: 31622400000 */
export const MILLISECONDS_PER_LEAP_YEAR = MILLISECONDS_PER_DAY * 366;

export interface DurationInput {
  years?: number | undefined | null | false;
  months?: number | undefined | null | false;
  weeks?: number | undefined | null | false;
  days?: number | undefined | null | false;
  hours?: number | undefined | null | false;
  minutes?: number | undefined | null | false;
  seconds?: number | undefined | null | false;
  milliseconds?: number | undefined | null | false;
  nanoseconds?: number | undefined | null | false;
}

export const makeMilliseconds = (
  input: Readonly<DurationInput> | { readonly totalMilliseconds: number } | number | null,
): number => {
  if (!input) {
    return 0;
  }
  if (typeof input === "number") {
    return input;
  }
  if ("totalMilliseconds" in input) {
    return input.totalMilliseconds;
  }
  const { years, months, weeks, days, hours, minutes, seconds, milliseconds, nanoseconds } = input;
  return (
    ((years as number) * MILLISECONDS_PER_YEAR || 0) +
    ((months as number) * MILLISECONDS_PER_MONTH || 0) +
    ((weeks as number) * MILLISECONDS_PER_WEEK || 0) +
    ((days as number) * MILLISECONDS_PER_DAY || 0) +
    ((hours as number) * MILLISECONDS_PER_HOUR || 0) +
    ((minutes as number) * MILLISECONDS_PER_MINUTE || 0) +
    ((seconds as number) * MILLISECONDS_PER_SECOND || 0) +
    ((milliseconds as number) * 1 || 0) +
    ((nanoseconds as number) / 1e6 || 0)
  );
};

export class ElapsedTime {
  public startTime: number;
  private _elapsed: number | undefined = undefined;

  public static timeUnits = [
    { unit: "y", amount: 60 * 60 * 24 * 365.25 },
    { unit: "d", amount: 60 * 60 * 24 },
    { unit: "h", amount: 60 * 60 },
    { unit: "m", amount: 60 },
    { unit: "s", amount: 1 },
    { unit: "ms", amount: 1 / 1000 },
  ];

  public constructor(startTime = performance.now()) {
    this.startTime = startTime;
  }

  public static start(): ElapsedTime {
    return new ElapsedTime();
  }

  /** Gets the number of elapsed milliseconds */
  public get elapsed(): number {
    const elapsed = this._elapsed;
    return elapsed !== undefined ? elapsed : performance.now() - this.startTime;
  }

  /** Gets the number of elapsed seconds */
  public get totalSeconds(): number {
    return this.elapsed / MILLISECONDS_PER_SECOND;
  }

  /** Gets the number of elapsed minutes */
  public get totalMinutes(): number {
    return this.elapsed / MILLISECONDS_PER_MINUTE;
  }

  /** Gets the number of elapsed hours */
  public get totalHours(): number {
    return this.elapsed / MILLISECONDS_PER_HOUR;
  }

  /** Gets the number of elapsed days */
  public get totalDays(): number {
    return this.elapsed / MILLISECONDS_PER_DAY;
  }

  /** True if running */
  public get isRunning(): boolean {
    return this._elapsed === undefined;
  }

  public stop(): void {
    if (this._elapsed === undefined) {
      this._elapsed = this.elapsed;
    }
  }

  public continue(): void {
    this._elapsed = undefined;
  }

  public restart(): void {
    this._elapsed = undefined;
    this.startTime = performance.now();
  }

  public valueOf(): number {
    return this.elapsed;
  }

  public [Symbol.toPrimitive](hint?: string): number | string {
    return hint === "number" ? this.elapsed : this.toString();
  }

  public getElapsedTime(): string {
    return ElapsedTime.millisecondsToString(this.elapsed);
  }

  public toJSON(): string {
    return this.toString();
  }

  public [util.inspect.custom](): string {
    return this.toString();
  }

  public toString(): string {
    return ElapsedTime.millisecondsToString(this.elapsed);
  }

  public static readonly millisecondsToString = millisecondsToString;

  public static secondsToString(seconds: number): string {
    return ElapsedTime.millisecondsToString(seconds * 1000);
  }
}

export function millisecondsToString(
  milliseconds: number | string | [number, number],
  options?: { fixed?: "s" | false | undefined },
): string {
  if (isArray(milliseconds)) {
    milliseconds = (milliseconds[0] * 1e9 + (milliseconds[1] || 0)) * 1e-6;
  }
  milliseconds = +milliseconds;
  if (!isFinite(milliseconds)) {
    return `${milliseconds}`;
  }

  const isNegative = milliseconds < 0;
  if (isNegative) {
    milliseconds = -milliseconds;
  }

  let n = milliseconds / 1000;

  const fixed = options?.fixed;
  if (fixed === "s") {
    return `${numberFixedString(isNegative ? -n : n, 3)
      .replace(".", "s ")
      .padStart(8, " ")}ms`;
  }

  let str = "";
  for (const { unit, amount } of ElapsedTime.timeUnits) {
    const v =
      unit === "ms" ? (milliseconds > 500 ? round(n / amount) : round((n / amount) * 100) / 100) : floor(n / amount);
    if (v) {
      str += `${v}${unit} `;
    }
    n -= v * amount;
  }
  return str.length > 0 ? (isNegative ? "-" : "") + str.trim() : `0ms`;
}
