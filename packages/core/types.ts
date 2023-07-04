import "./global";

/**
 * In NodeJS, this is the same as `util.inspect.custom`, see https://nodejs.org/api/util.html#utilinspectcustom
 * In browser, this is a symbol that is not defined by default, so we define it here.
 */
export const customInspectSymbol = Symbol.for("nodejs.util.inspect.custom");

export type NullablePartial<T> = {
  [P in keyof T]?: T[P] | null | undefined;
};

/** null | undefined */
export type NullOrUndefined = null | undefined;

/** false | 0 | "" | null | undefined */
export type Falsy = false | 0 | "" | null | undefined;

/** Return typer of setTimeout function, it can be different in node, deno and browser */
export type Timeout = ReturnType<typeof setTimeout>;

/** UnsafeAny = any. Use this type only if strictly necessary, we should not use any much! */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnsafeAny = any;

/** Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array */
export type IntegerTypedArray = Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array;

/** BigUint64Array | BigInt64Array */
export type BigIntegerTypedArray = BigUint64Array | BigInt64Array;

/** Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | BigUint64Array | BigInt64Array */
export type ExtendedIntegerTypedArray = IntegerTypedArray | BigIntegerTypedArray;

/** Float32Array | Float64Array */
export type FloatTypedArray = Float32Array | Float64Array;

/** Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | BigUint64Array | BigInt64Array | Float32Array | Float64Array */
export type TypedArray = ExtendedIntegerTypedArray | FloatTypedArray;

/** A class from an instance type */
export interface ClassOf<T, A extends UnsafeAny[] = UnsafeAny[]> extends Function {
  readonly prototype: T;
  new (...args: A): T;
}

export interface MayHaveCustomSerialization {
  /** A generic JSON conversion function */
  toJSON?(): unknown;

  /** A generic NodeJS inspection function */
  [customInspectSymbol]?(): unknown;

  /** A generic NodeJS inspection function */
  inspect?(): unknown;
}
