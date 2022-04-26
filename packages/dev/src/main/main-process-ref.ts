import { noop } from "../utils";

let _mainProcessRefCounter = 0;
let _mainProcessRefInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Keeps the main process alive, also if there are no pending async operations.
 * Call mainProcessUnref to go back to decrement the counter or references to the main process.
 *
 * @returns A function that removes this reference.
 */
export function mainProcessRef() {
  if (++_mainProcessRefCounter === 1) {
    _mainProcessRefInterval = setInterval(noop, 0x7fffffff);
  }
  let removed = false;
  return () => (removed ? false : (removed = mainProcessUnref()));
}

/** Gets the number of references held */
mainProcessRef.count = () => _mainProcessRefCounter;

/** Prevent node to exit while a promise is running */
mainProcessRef.wrapPromise = async <T>(promise: Promise<T>): Promise<T> => {
  const unref = mainProcessRef();
  try {
    return await promise;
  } finally {
    unref();
  }
};

/** Opposite of mainProcessRef */
export function mainProcessUnref() {
  if (_mainProcessRefCounter <= 0) {
    return false;
  }
  if (--_mainProcessRefCounter === 0) {
    clearInterval(_mainProcessRefInterval!);
  }
  return true;
}
