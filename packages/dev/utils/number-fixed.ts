const { parseFloat } = Number;

const INFINITY_REGEX = /^([+-])?(∞|infinity)/i;

export interface NumberFixedStringOptions {
  // Number of decimal digits to use.
  decimalDigits?: number;

  // True if , separator should be added
  useGrouping?: boolean;

  minimumFractionDigits?: number;
  maximumFractionDigits?: number;

  padStart?: number;
  postix?: string;
}

/**
 * Converts a fixedPoint number to string. With no exponential notation.
 * @param value The value to convert to string.
 * @param decimalDigits The number of decimal digits to use. Same functionality as number.toFixed(decimalDigits). Default is 6.
 * @returns The number to string.
 */
export function numberFixedString(
  value: number | bigint | string | boolean | null | undefined,
  decimalDigits?: number,
): string;

/**
 * Converts a fixedPoint number to string. With no exponential notation.
 * @param value The value to convert to string.
 * @param options Formatting options.
 * @returns The number to string.
 */
export function numberFixedString(
  value: number | bigint | string | boolean | null | undefined,
  options: NumberFixedStringOptions,
): string;

export function numberFixedString(
  value: number | bigint | string | boolean | null | undefined,
  options?: NumberFixedStringOptions | number,
): string {
  value = _toNumber(value);

  let useGrouping: boolean = false;
  let minimumFractionDigits: number | undefined;
  let maximumFractionDigits: number;
  let padStart: number;
  let postfix: string | undefined;

  if (typeof options === "number") {
    useGrouping = false;
    minimumFractionDigits = options;
    maximumFractionDigits = options;
    padStart = 0;
  } else if (options) {
    useGrouping = !!options.useGrouping;
    minimumFractionDigits = options.minimumFractionDigits ?? options.decimalDigits;
    maximumFractionDigits = options.maximumFractionDigits ?? options.decimalDigits ?? 6;
    padStart = options.padStart || 0;
    postfix = options.postix;
  } else {
    maximumFractionDigits = 6;
    padStart = 0;
  }

  if (typeof minimumFractionDigits === "number") {
    minimumFractionDigits |= 0; // Convert to integer
  }

  value = +value;

  let result: string;
  if (!isFinite(value)) {
    result = value.toString();
    if (postfix && padStart > 0) {
      result += " ".repeat(postfix.length);
    }
  } else {
    result = value.toLocaleString("en", {
      useGrouping,
      minimumFractionDigits,
      maximumFractionDigits: maximumFractionDigits | 0,
    });

    const parsedInfinity = INFINITY_REGEX.exec(result);
    if (parsedInfinity) {
      return parsedInfinity[1] === "-" ? "-Infinity" : "Infinity";
    }

    if (result.startsWith("+") || /^-0.0+$/.test(result)) {
      result = result.slice(1); // Remove sign from +1234 and -0.000...
    }

    if (postfix) {
      result += postfix;
    }
  }

  if (padStart > 0) {
    result = result.padStart(padStart, " ");
  }

  return result;
}

/**
 * Rounds a value to the nearest fixedPoint value.
 * @example fixedPointRound(13423.12345610134, 6) => 13423.123456
 */
export function numberFixedRound(
  value: number | bigint | string | boolean | null | undefined,
  decimalDigits: number,
): number {
  value = _toNumber(value);
  if (!isFinite(value)) {
    return value;
  }
  const options = { useGrouping: false, minimumFractionDigits: decimalDigits, maximumFractionDigits: decimalDigits };
  return parseFloat(value.toLocaleString("en", options)) + 0; // +0 is required to handle +0 and -0
}

/**
 * Returns the greatest value truncated to the given number of digits.
 * @example fixedPointFloor(13423.12345670134, 6) => 13423.123456
 */
export function numberFixedTrunc(
  value: number | bigint | string | boolean | null | undefined,
  decimalDigits: number,
): number {
  value = _toNumber(value);
  if (!isFinite(value)) {
    return value;
  }
  if (decimalDigits <= 0) {
    decimalDigits = 0;
  }
  decimalDigits = (decimalDigits | 0) + 1; // Convert to integer
  const options = { useGrouping: false, maximumFractionDigits: decimalDigits, minimumFractionDigits: decimalDigits };
  return parseFloat(value.toLocaleString("en", options).slice(0, -1)) + 0; // +0 is required to handle +0 and -0
}

function _toNumber(value: number | bigint | string | boolean | null | undefined) {
  const n = +(value as number) + 0; // (+val+0) is required to handle NaN, +0 and -0.
  if (n === 0) {
    return 0;
  }
  if (!n && typeof value === "string") {
    // Remove spaces and commas
    value = value.replace(/[\s,]/g, "");
    const m = +value + 0;
    if (isFinite(m)) {
      return m;
    }
    const parsedInfinity = INFINITY_REGEX.exec(value);
    if (parsedInfinity) {
      return parsedInfinity[1] === "-" ? -Infinity : Infinity;
    }
  }
  return n;
}
