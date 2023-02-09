import { Module } from "module";
import path from "path";
import type { UnsafeAny } from "../types";
import { fileURLToPath, pathToFileURL } from "url";
import { devError } from "../dev-error";
import { devRunMain } from "../main";

export interface ParsedArguments {
  require: string[];
  timed: boolean;
  function: string;
  title: string;
  processExitTimeout: { milliseconds: number; exitCode?: number | undefined } | undefined;
  nodeEventsMaxListeners: number | undefined;
  stackTraceLimit: number | undefined;
  script: string;
  scriptArgs: string[];
  noColor: boolean;
  ci: boolean;
}

class MainModule extends Module {
  load!: (filename: string) => void;

  constructor(filename: string) {
    super(filename, module);
    this.filename = filename;
    this.paths = (Module as UnsafeAny)._nodeModulePaths(process.cwd());

    let exportsError: unknown = MainModule;
    let exportsLoaded = false;
    let exports = this.exports;

    const oldLoad = this.load;
    this.load = (): void => {
      this.loaded = true;
    };

    const loadExports = (): typeof exports => {
      if (exportsLoaded) {
        if (exportsError !== MainModule) {
          throw exportsError;
        }
        return exports;
      }
      let hadCache = false;
      const wasLoaded = this.loaded;
      try {
        exportsLoaded = true;
        this.loaded = false;
        hadCache = require.cache[filename] === this;
        if (hadCache) {
          delete require.cache[filename];
        }
        oldLoad.call(this, filename);
      } catch (e) {
        exportsError = e !== MainModule ? e : undefined;
        exportsLoaded = false;
        try {
          exportsError = devError(exportsError, loadExports);
        } catch {}
        if (!exportsError) {
          exportsError = new SyntaxError(`Error while loading module ${filename}`);
        }
        try {
          (exportsError as UnsafeAny)._module = filename;
        } catch {}
        throw exportsError;
      } finally {
        if (wasLoaded) {
          this.loaded = true;
        }
        if (hadCache) {
          require.cache[filename] = this;
        }
      }
      return exports;
    };

    Object.defineProperty(this, "exports", {
      get: loadExports,
      set: (value) => {
        if (value !== undefined && value !== exports) {
          exports = value;

          exportsLoaded = true;
          exportsError = MainModule;
        }
      },
      configurable: true,
      enumerable: true,
    });
  }
}

export function devrun(options: ParsedArguments): void {
  if (options.noColor) {
    process.env.FORCE_COLOR = "0";
    process.env.NO_COLOR = "true";
  }

  if (options.ci) {
    process.env.CI = "true";
  }

  const cwdRequire = Module.createRequire(path.resolve(process.cwd(), "_"));

  const tryResolve = (id: string): string | undefined => {
    try {
      return cwdRequire.resolve(id);
    } catch {}
    return undefined;
  };

  let script = options.script;
  try {
    script = fileURLToPath(pathToFileURL(script).href);
  } catch {}
  script = path.resolve(script);
  script = tryResolve(script) || tryResolve(path.join(script, "main")) || script;

  const mainModule = new MainModule(script);
  require.cache[mainModule.filename] = mainModule;
  mainModule.loaded = true;
  process.mainModule = mainModule;

  process.argv[1] = mainModule.filename;
  process.argv.splice(2, process.argv.length - 2, ...options.scriptArgs);

  const _devRunMain = devRunMain;
  void _devRunMain(mainModule, {
    onBeforeStart() {
      for (const id of options.require) {
        cwdRequire(id);
      }
    },
    processExitTimeout: options.processExitTimeout,
    initTsNode: false,
    nodeEventsMaxListeners: options.nodeEventsMaxListeners,
    printProcessBanner: options.timed,
    initErrorHandling: true,
    title: options.title,
    functionName: options.function,
  });
}
