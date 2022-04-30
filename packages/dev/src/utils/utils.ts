import { performance } from "node:perf_hooks";

const { round, floor, ceil, min, log, abs } = Math;
const { isArray } = Array;
const { isFinite } = Number;

const _timeUnits = [
  { unit: "y", amount: 60 * 60 * 24 * 365.25 },
  { unit: "d", amount: 60 * 60 * 24 },
  { unit: "h", amount: 60 * 60 },
  { unit: "m", amount: 60 },
  { unit: "s", amount: 1 },
  { unit: "ms", amount: 1 / 1000 },
];

export function millisecondsToString(milliseconds: number | string | readonly [number, number]) {
  if (isArray(milliseconds)) {
    milliseconds = (milliseconds[0] * 1e9 + (milliseconds[1] || 0)) * 1e-6;
  }
  milliseconds = +milliseconds;
  if (!isFinite(milliseconds)) {
    return `${milliseconds}`;
  }
  let str = "";
  const isNegative = milliseconds < 0;
  let n = (isNegative ? -milliseconds : milliseconds) / 1000;
  for (const { unit, amount } of _timeUnits) {
    const v =
      unit === "ms" ? (milliseconds > 500 ? round(n / amount) : round((n / amount) * 100) / 100) : floor(n / amount);
    if (v) {
      str += `${v}${unit} `;
    }
    n -= v * amount;
  }
  return str.length > 0 ? (isNegative ? "-" : "") + str.trim() : `0ms`;
}

/**
 * Starts measuring time. Returns a function that when called gets the number of elapsed milliseconds.
 * Calling toString on the result will get a prettyfied elapsed time string.
 */
export function startMeasureTime() {
  const startTime = performance.now();
  const elapsedMilliseconds = () => performance.now() - startTime;
  elapsedMilliseconds.toString = () => millisecondsToString(performance.now() - startTime);
  return elapsedMilliseconds;
}

/** Gets the length of an UTF8 string */
export function utf8ByteLength(b: number | string | Buffer | Uint8Array | null | undefined): number {
  return b === null || b === undefined
    ? 0
    : typeof b === "number"
    ? b || 0
    : typeof b === "string"
    ? Buffer.byteLength(b, "utf8")
    : b.length;
}

/** Gets a size in bytes in an human readable form. */
export function prettySize(
  bytes: number | string | Buffer | Uint8Array | null | undefined,
  options?: { appendBytes?: boolean | undefined } | undefined,
) {
  if (bytes === null || bytes === undefined) {
    bytes = 0;
  }
  const appendBytes = !!options && options.appendBytes;
  if (typeof bytes === "object" || typeof bytes === "string") {
    bytes = utf8ByteLength(bytes);
  }
  bytes = bytes < 0 ? floor(bytes) : ceil(bytes);
  let s;
  if (!isFinite(bytes) || bytes < 1024) {
    s = `${bytes} ${appendBytes ? "Bytes" : "B"}`;
  } else {
    const i = min(floor(log(abs(bytes)) / log(1024)), 6);
    s = `${+(bytes / 1024 ** i).toFixed(2)} ${i ? " kMGTPE"[i] : ""}`;
    if (appendBytes) {
      s += `, ${bytes} Bytes`;
    }
  }
  return s;
}

/** Makes an utf8 string. Removes UTF8 BOM header if present. */
export function toUTF8(text: string | Buffer | Uint8Array | null | undefined | boolean) {
  if (text === null || text === undefined) {
    return "";
  }
  if (typeof text === "string") {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }
  if (typeof text === "boolean" || typeof text === "number") {
    return text.toString();
  }
  if (!Buffer.isBuffer(text)) {
    text = Buffer.from(text);
  }
  return (text[0] === 0xfe && text[1] === 0xff) || (text[0] === 0xff && text[1] === 0xfe)
    ? text.toString("utf8", 2)
    : text.toString();
}

export const noop = () => {};

export type noop = () => void;

export const returnArg = <T>(arg: T): T => arg;

export const returnArg1 = <T>(_: unknown, arg: T): T => arg;

export const returnArg2 = <T>(_0: unknown, _1: unknown, arg: T): T => arg;

export const returnArg3 = <T>(_0: unknown, _1: unknown, _2: unknown, arg: T): T => arg;

export const returnArg4 = <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, arg: T): T => arg;
