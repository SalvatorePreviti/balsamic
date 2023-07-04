import type { Falsy, UnsafeAny } from "./types";

const { defineProperty } = /* @__PURE__ */ Reflect;

export const isArray = /* @__PURE__ */ Array.isArray;

/** Returns true if the given value is a Promise, an object with a then and catch methods */
export const isPromise: {
  (value: Promise<void>): value is Promise<void>;
  <T = unknown>(value: Promise<T>): value is Promise<T>;
  <T = unknown>(value: unknown): value is Promise<T>;
} = <T = unknown>(value: unknown): value is Promise<T> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Promise<T>).then === "function" &&
  typeof (value as Promise<T>).catch === "function";

/** Returns true if the given value is a PromiseLike, an object with a then method */
export const isPromiseLike: {
  (value: PromiseLike<void>): value is PromiseLike<void>;
  <T = unknown>(value: PromiseLike<T>): value is PromiseLike<T>;
  <T = unknown>(value: unknown): value is PromiseLike<T>;
} = <T = unknown>(value: unknown): value is PromiseLike<T> =>
  typeof value === "object" && value !== null && typeof (value as Promise<T>).then === "function";

/** Returns true if the given value is an Iterable, an object or a function with a Symbol.iterator method */
export const isIterable: {
  <T>(value: Iterable<T>): value is Iterable<T>;
  <T>(value: unknown): value is Iterable<T>;
} = <T>(value: unknown): value is Iterable<T> =>
  value !== null && value !== undefined && typeof (value as Iterable<T>)[Symbol.iterator] === "function";

/** Returns true if the given value is a not null object */
export const isNonNullObject = <T>(value: T): value is Exclude<T, Falsy> => typeof value === "object" && value !== null;

/** A function that does nothing */
export const noop = /* @__PURE__ */ () => {};

/** A function that return this */
export function fnThis<T>(this: T): T {
  return this;
}

/** A function that returns always 0 */
export const fnZero = /* @__PURE__ */ () => 0;

/** A function that returns always true */
export const fnTrue = /* @__PURE__ */ () => true;

/** A function that returns always false */
export const fnFalse = /* @__PURE__ */ () => false;

/** A function that returns always null */
export const fnNull = /* @__PURE__ */ () => null;

/** A function that returns always the first argument */
export const fnArg0: {
  <T>(arg: T): T;
  <T>(arg: T, ...args: unknown[]): T;
  (): undefined;
} = /* @__PURE__ */ <T>(arg?: T) => arg;

/** A function that returns always the second argument */
export const fnArg1: {
  <T>(_0: unknown, arg1: T): T;
  <T>(_0: unknown, arg1: T, ...args: unknown[]): T;
  (): undefined;
  (_0?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, arg1?: T) => arg1;

/** A function that returns always the third argument */
export const fnArg2: {
  <T>(_0: unknown, _1: unknown, arg2: T): T;
  <T>(_0: unknown, _1: unknown, arg2: T, ...args: unknown[]): T;
  (_0?: unknown, _1?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, _1?: unknown, arg2?: T) => arg2;

/** A function that returns always the fourth argument */
export const fnArg3: {
  <T>(_0: unknown, _1: unknown, _2: unknown, arg3: T): T;
  <T>(_0: unknown, _1: unknown, _2: unknown, arg3: T, ...args: unknown[]): T;
  (_0?: unknown, _1?: unknown, _2?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, _1?: unknown, _2?: unknown, arg3?: T) => arg3;

/** A function that returns always the fifth argument */
export const fnArg4: {
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, arg4: T): T;
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, arg4: T, ...args: unknown[]): T;
  (_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown, arg4?: T) => arg4;

/** A function that returns always the sixth argument */
export const fnArg5: {
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, _4: unknown, arg5: T): T;
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, _4: unknown, arg5: T, ...args: unknown[]): T;
  (_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown, _4?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown, _4?: unknown, arg5?: T) => arg5;

/** A function that returns always the seventh argument */
export const fnArg6: {
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, _4: unknown, _5: unknown, arg6: T): T;
  <T>(_0: unknown, _1: unknown, _2: unknown, _3: unknown, _4: unknown, _5: unknown, arg6: T, ...args: unknown[]): T;
  (_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown, _4?: unknown, _5?: unknown): undefined;
} = /* @__PURE__ */ <T>(_0?: unknown, _1?: unknown, _2?: unknown, _3?: unknown, _4?: unknown, _5?: unknown, arg6?: T) =>
  arg6;

const {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  hasOwn,
  keys: objectKeys,
} = /* @__PURE__ */ Object as typeof Object & {
  hasOwn?(o: object, v: PropertyKey): boolean;
};

/**
 * Cross browser implementation of Object.hasOwn
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn
 */
export const objectHasOwn: /* @__PURE__ */ (obj: unknown, key: PropertyKey) => boolean = (() => {
  if (hasOwn) {
    return (obj: unknown, key: PropertyKey) => obj !== null && obj !== undefined && hasOwn(obj, key);
  }
  const protoHasOwn = Object.prototype.hasOwnProperty;
  return (obj: unknown, key: PropertyKey) => protoHasOwn.call(obj, key);
})();

/**
 * Returns true if the given object has at least one enumerable key and is not null, undefined or an empty object
 * @param obj The object to check
 * @param recursePrototype If true, the prototype chain will be traversed, default is false.
 * @returns true if the given object has at least one enumerable key
 * @example objectHasKeys({}) === false
 * @example objectHasKeys({ a: 1 }) === true
 */
export const objectHasKeys = /* @__PURE__ */ (obj: unknown, recursePrototype?: boolean): obj is object => {
  if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (recursePrototype || objectHasOwn(obj, key)) {
        return true;
      }
    }
  }
  return false;
};

/** Finds a property descriptor in an object or its prototypes */
export const objectFindPropertyDescriptor = /* @__PURE__ */ (
  obj: unknown,
  key: PropertyKey,
): PropertyDescriptor | undefined => {
  let descriptor: PropertyDescriptor | undefined;
  if (obj !== undefined) {
    try {
      for (let o: unknown = obj; o !== null; o = getPrototypeOf(o)) {
        descriptor = getOwnPropertyDescriptor(o, key);
        if (descriptor) {
          break;
        }
      }
    } catch {}
  }
  return descriptor;
};

/** Change an object property, maintaining its original configurable, writable, enumerable settings if possible */
export const objectSetOrDefineProperty = /* @__PURE__ */ (obj: unknown, key: PropertyKey, value: unknown): boolean => {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  try {
    if ((obj as UnsafeAny)[key] !== value) {
      const d = objectFindPropertyDescriptor(obj, key);
      if (!d || !("value" in d) || !defineProperty(obj, key, { ...d, value })) {
        (obj as UnsafeAny)[key] = value;
      }
    }
    return true;
  } catch {}
  return false;
};

/**
 * Simple comparison of two DTOs plain objects. It does not support circular references.
 */
export const objectPlainEqual = /* @__PURE__ */ (a: UnsafeAny, b: UnsafeAny): boolean => {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    // eslint-disable-next-line no-self-compare
    return a !== a && b !== b;
  }
  const aIsArray = isArray(a);
  if (aIsArray !== isArray(b)) {
    return false;
  }
  if (aIsArray) {
    const len = a.length;
    if (len !== b.length) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (!objectPlainEqual(a[i], b[i])) {
        return false;
      }
    }
  }
  const ka = objectKeys(a);
  const kb = objectKeys(b);
  const len = ka.length;
  if (len !== kb.length) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    const key = ka[i]!;
    if ((!(key in b) && !objectHasOwn(b, key)) || !objectPlainEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
};
