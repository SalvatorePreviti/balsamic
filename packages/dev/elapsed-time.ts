import util from "node:util";
import { performance } from "node:perf_hooks";
import { numberFixedString } from "./utils/number-fixed";

const { isArray } = Array;
const { isFinite } = Number;
const { round, floor } = Math;

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

  public get elapsed(): number {
    const elapsed = this._elapsed;
    return elapsed !== undefined ? elapsed : performance.now() - this.startTime;
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
