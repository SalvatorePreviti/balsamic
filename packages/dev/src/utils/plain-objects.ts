const { isArray } = Array;
const { keys: objectKeys } = Object;

export namespace plainObjects {
  /**
   * Compares two json objects for equality
   */
  export function deepEquals(a: unknown, b: unknown): boolean {
    if (!(a !== b)) {
      return true;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
      return false;
    }
    if (isArray(a)) {
      if (!isArray(b) || a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; ++i) {
        if (!deepEquals(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    const keys = objectKeys(a);
    if (keys.length !== objectKeys(b).length) {
      return false;
    }
    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i]!;
      if (!deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false;
      }
    }
    return true;
  }

  export namespace sortObjectKeys {
    export interface Options {
      sortArrays?: boolean;
    }
  }

  export function deepClone<T>(value: T): T {
    return _deepClone(new Map<unknown, unknown>(), value) as T;
  }
  export function sortObjectKeys<T>(input: T, options?: sortObjectKeys.Options): T {
    return _sortObjectKeys(new Map<unknown, unknown>(), input, !!options?.sortArrays) as T;
  }
}

function _sortObjectKeys(processed: Map<unknown, unknown>, o: unknown, sortArrays: boolean) {
  if (typeof o !== "object" || o === null) {
    return o;
  }
  if (processed.has(o)) {
    return processed.get(o);
  }
  if (isArray(o)) {
    const array = o.slice();
    if (sortArrays) {
      array.sort();
    }
    processed.set(o, array);
    return array;
  }
  const result: Record<string, unknown> = {};
  for (const key of objectKeys(o).sort()) {
    const value = (o as Record<string, unknown>)[key];
    result[key] = _sortObjectKeys(processed, value, sortArrays);
  }
  processed.set(o, result);
  return result;
}

function _deepClone(processed: Map<unknown, unknown>, o: unknown) {
  if (typeof o !== "object" || o === null) {
    return o;
  }
  if (processed.has(o)) {
    return processed.get(o);
  }
  if (isArray(o)) {
    return o.slice();
  }
  const result: Record<string, unknown> = {};
  for (const key of objectKeys(o)) {
    result[key] = _deepClone(processed, (o as Record<string, unknown>)[key]);
  }
  processed.set(o, result);
  return result;
}
