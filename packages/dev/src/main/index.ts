import path from "path";
import { fileURLToPath } from "url";
import { devEnv } from "../dev-env";
import { devError } from "../dev-error";
import { devLog } from "../dev-log";
import { millisecondsToString } from "../utils";
import { mainProcessRef } from "./main-process-ref";

/** Returns true if the given module (filename, module object, import.meta) is the main module running in NodeJS */
export function isMainModule(
  module:
    | string
    | URL
    | Partial<Readonly<NodeModule>>
    | { url?: string }
    | { filename?: string }
    | { href?: string }
    | false
    | null
    | undefined,
) {
  if (!module) {
    return false;
  }
  if (process.mainModule === module || require.main === module) {
    return true;
  }
  if (typeof module === "object") {
    module = (module as any).url || (module as any).href || (module as any).filename || (module as any).id;
  }
  if (typeof module !== "string" || !module.length) {
    return false;
  }
  if (/^file:\/\//i.test(module)) {
    if (process.argv[1] === module) {
      return true;
    }
    try {
      module = path.resolve(fileURLToPath(module));
    } catch (_) {}
  }
  const scriptPath = path.resolve(process.argv[1]);
  return module === scriptPath || stripExt(module) === scriptPath;
}

function stripExt(name: string) {
  const extension = path.extname(name);
  return extension ? name.slice(0, -extension.length) : name;
}

/** Top level run of functions and promises */
export function devRunMain<T = unknown>(
  main: { exports: () => T | Promise<T> } | (() => T | Promise<T>) | Promise<T> | T,
  processTitle?: string,
  options?: devRunMain.Options<T>,
): Promise<T | Error>;

export function devRunMain<T extends null | false | undefined>(
  main: T,
  processTitle?: string,
  options?: devRunMain.Options<T>,
): Promise<T>;

export function devRunMain<T = unknown>(
  main: any,
  processTitle?: string,
  options?: devRunMain.Options<T>,
): Promise<T | Error> {
  let handledError: Error | undefined;

  if (main === false || main === undefined || main === null) {
    return Promise.resolve(main);
  }

  function devRunMainError(error: any) {
    try {
      if (handledError !== error) {
        handledError = error;
        error = devError(error, devRunMain);
        devError.handleUncaughtException(error);
      } else if (!(error instanceof Error)) {
        error = devError(error, devRunMain);
      }
    } catch {}
    return error;
  }

  try {
    devError.initErrorHandling();
    devLog.initProcessTime();

    if (processTitle) {
      devEnv.setProcessTitle(processTitle);
    } else if (typeof main === "object" && main !== null && !devEnv.getProcessTitle.hasProcessTitle()) {
      devEnv.setProcessTitle(main as any);
    }

    devLog.printProcessBanner();

    if (!main) {
      return main as any;
    }

    if (main !== null && typeof main === "object") {
      if ("exports" in main) {
        main = main.exports;
      }
    }

    let result: any;
    if (typeof main === "function") {
      result = (main as any)();
    }

    const onTerminated = (ret: T | Error) => {
      if (options) {
        if (options?.processExitTimeout) {
          devRunMain.processExitTimeout(options?.processExitTimeout);
        }
        if (typeof options.onTerminated === "function") {
          options.onTerminated(ret);
        }
      }
    };

    if (typeof result === "object" && result !== null && typeof result.then === "function") {
      const devRunMainPromise = async (ret: any) => {
        const unref = mainProcessRef();
        try {
          try {
            ret = await ret;
          } catch (error) {
            ret = error;
          }
          try {
            if (ret instanceof Error) {
              ret = devRunMainError(result);
            }
          } finally {
            onTerminated(ret);
          }
          return ret;
        } finally {
          unref();
        }
      };

      return devRunMainPromise(result);
    }

    if (result instanceof Error) {
      result = devRunMainError(result);
    }

    onTerminated(result);

    return Promise.resolve(result);
  } catch (error) {
    return Promise.resolve(devRunMainError(error));
  }
}

export namespace devRunMain {
  export interface Options<T = unknown> {
    /**
     * If non zero, invokes process.exit(2) after the specific time if the application does not terminate.
     * Useful to make a script terminate also if there are pending asynchronous operations.
     */
    processExitTimeout?: number;

    /** Function to be executed at the end */
    onTerminated?(result: Error | T): void;
  }

  /**
   * Ensures that the application terminates with a timer, in case some service did hang.
   * Returns a cancellation object
   */
  export function processExitTimeout(
    milliseconds: number = 5100,
    exitCode: number = 2,
  ): { cancel(): void; restart(): void } {
    const processExitTimeoutReached = () => {
      devLog.error();
      const code = process.exitCode || exitCode || 2;
      devLog.error(`💀 Process exit timeout of ${millisecondsToString(milliseconds)} reached. exitCode:${code}`);
      // eslint-disable-next-line no-process-exit
      process.exit(code);
    };

    if (milliseconds > 500) {
      setTimeout(() => {
        devLog.warn();
        devLog.warn("terminating...");
      }, 350).unref();
    }

    const start = () => setTimeout(processExitTimeoutReached, milliseconds).unref();

    const timeout = start();

    return {
      cancel() {
        clearTimeout(timeout);
      },
      restart() {
        clearTimeout(timeout);
        start();
      },
    };
  }
}
