import { numberFixedString } from "./number-fixed";

const { floor, ceil, min, log, abs } = Math;
const { isFinite } = Number;

export namespace utf8ByteLength {
  export type Input = number | string | Buffer | Uint8Array | false | null | undefined;
}

/** Gets the length of an UTF8 string */
export function utf8ByteLength(...args: utf8ByteLength.Input[]): number {
  let total = 0;
  for (const b of args) {
    total += !b ? 0 : typeof b === "number" ? b || 0 : typeof b === "string" ? Buffer.byteLength(b, "utf8") : b.length;
  }
  return total;
}

/** Gets a size in bytes in an human readable form. */
export function prettySize(
  bytes: number | string | Buffer | Uint8Array | null | undefined,
  options?: { appendBytes?: boolean | undefined } | undefined,
): string {
  if (bytes === null || bytes === undefined) {
    bytes = 0;
  }
  const appendBytes = !!options && options.appendBytes;
  if (typeof bytes === "object" || typeof bytes === "string") {
    bytes = utf8ByteLength(bytes);
  }
  bytes = bytes < 0 ? floor(bytes) : ceil(bytes);
  let s;
  if (!isFinite(bytes) || abs(bytes) < 1024) {
    s = `${bytes} ${appendBytes ? "Bytes" : "B"}`;
  } else {
    const isNegative = bytes < 0;
    if (isNegative) {
      bytes = -bytes;
    }
    const i = min(floor(log(abs(bytes)) / log(1024)), 6);
    s = `${isNegative ? "-" : ""}${numberFixedString(bytes / 1024 ** i, 2)} ${i ? " kMGTPE"[i] : ""}`;
    if (appendBytes && bytes > 1024) {
      s += `, ${isNegative ? "-" : ""}${bytes} Bytes`;
    }
  }
  return s;
}

/** Makes an utf8 string. Removes UTF8 BOM header if present. */
export function toUTF8(text: string | Buffer | Uint8Array | null | undefined | boolean): string {
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

export type noop = () => void;

export const noop = (): void => {};
