import util from "node:util";
import { performance } from "node:perf_hooks";
import { numberFixedString } from "./utils/number-fixed";

const { isArray } = Array;
const { isFinite } = Number;
const { round, floor } = Math;

/** Number of milliseconds in a second (1000) */
export const SECONDS_IN_MILLISECONDS = 1000;

/** Number of milliseconds in a minute (60,000) */
export const MINUTES_IN_MILLISECONDS = SECONDS_IN_MILLISECONDS * 60;

/** Number of milliseconds in an hour (3,600,000) */
export const HOURS_IN_MILLISECONDS = MINUTES_IN_MILLISECONDS * 60;

/** Number of milliseconds in a day (86,400,000) */
export const DAYS_IN_MILLISECONDS = HOURS_IN_MILLISECONDS * 24;

/** Number of milliseconds in a week (604,800,000) */
export const WEEKS_IN_MILLISECONDS = DAYS_IN_MILLISECONDS * 7;

/** Number of milliseconds in a month (2,592,000,000) */
export const MONTHS_IN_MILLISECONDS = DAYS_IN_MILLISECONDS * 30.4375;

/** Number of milliseconds in a year (31,536,000,000) */
export const YEARS_IN_MILLISECONDS = DAYS_IN_MILLISECONDS * 365.25;

/** Number of seconds in a minute (60) */
export const MILLISECONDS_IN_SECONDS = 1 / SECONDS_IN_MILLISECONDS;

/** Number of minutes in an hour (60) */
export const MILLISECONDS_IN_MINUTES = 1 / MINUTES_IN_MILLISECONDS;

/** Number of hours in a day (24) */
export const MILLISECONDS_IN_HOURS = 1 / HOURS_IN_MILLISECONDS;

/** Number of days in a week (7) */
export const MILLISECONDS_IN_DAYS = 1 / DAYS_IN_MILLISECONDS;

/** Number of weeks in a month (4.345238095238095) */
export const MILLISECONDS_IN_WEEKS = 1 / WEEKS_IN_MILLISECONDS;

/** Number of months in a year (12) */
export const MILLISECONDS_IN_MONTHS = 1 / MONTHS_IN_MILLISECONDS;

/** Number of years in a millisecond (3.168808781402895e-11) */
export const MILLISECONDS_IN_YEARS = 1 / YEARS_IN_MILLISECONDS;

export namespace toMilliseconds {
  export type Options = {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
  };
}

export function toMilliseconds({
  years,
  months,
  weeks,
  days,
  hours,
  minutes,
  seconds,
  milliseconds,
}: toMilliseconds.Options): number {
  let total = 0;
  if (years !== undefined) {
    total += millisecondsToYears(years);
  }
  if (months !== undefined) {
    total += millisecondsToMonths(months);
  }
  if (weeks !== undefined) {
    total += millisecondsToWeeks(weeks);
  }
  if (days !== undefined) {
    total += millisecondsToDays(days);
  }
  if (hours !== undefined) {
    total += millisecondsToHours(hours);
  }
  if (minutes !== undefined) {
    total += millisecondsToMinutes(minutes);
  }
  if (seconds !== undefined) {
    total += millisecondsToSeconds(seconds);
  }
  if (milliseconds !== undefined) {
    total += milliseconds;
  }
  return total;
}

export function millisecondsToSeconds(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_SECONDS;
}

export function millisecondsToMinutes(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_MINUTES;
}

export function millisecondsToHours(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_HOURS;
}

export function millisecondsToDays(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_DAYS;
}

export function millisecondsToWeeks(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_WEEKS;
}

export function millisecondsToMonths(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_MONTHS;
}

export function millisecondsToYears(milliseconds: number): number {
  return milliseconds * MILLISECONDS_IN_YEARS;
}

export function secondsToMilliseconds(seconds: number): number {
  return seconds * SECONDS_IN_MILLISECONDS;
}

export function minutesToMilliseconds(minutes: number): number {
  return minutes * MINUTES_IN_MILLISECONDS;
}

export function hoursToMilliseconds(hours: number): number {
  return hours * HOURS_IN_MILLISECONDS;
}

export function daysToMilliseconds(days: number): number {
  return days * DAYS_IN_MILLISECONDS;
}

export function weeksToMilliseconds(weeks: number): number {
  return weeks * WEEKS_IN_MILLISECONDS;
}

export function monthsToMilliseconds(months: number): number {
  return months * MONTHS_IN_MILLISECONDS;
}

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

  /** Gets the number of elapsed milliseconds */
  public get elapsedMilliseconds(): number {
    return this.elapsed;
  }

  /** Gets the number of elapsed seconds */
  public get elapsedSeconds(): number {
    return this.elapsedMilliseconds / 1000;
  }

  /** Gets the number of elapsed minutes */
  public get elapsedMinutes(): number {
    return this.elapsedSeconds / 60;
  }

  /** Gets the number of elapsed hours */
  public get elapsedHours(): number {
    return this.elapsedMinutes / 60;
  }

  /** Gets the number of elapsed days */
  public get elapsedDays(): number {
    return this.elapsedHours / 24;
  }

  /** Gets the number of elapsed weeks */
  public get elapsedWeeks(): number {
    return this.elapsedDays / 7;
  }

  /** Gets the number of elapsed months */
  public get elapsedMonths(): number {
    return this.elapsedDays / 30.4375;
  }

  /** Gets the number of elapsed years */
  public get elapsedYears(): number {
    return this.elapsedDays / 365.25;
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
