#!/usr/bin/env node

import { Module } from "module";
import path from "path";
import type { UnsafeAny } from "../types";
import { fileURLToPath, pathToFileURL } from "url";

const DEFAULT_STACK_TRACE_LIMIT = 20;

function printHelp(): void {
  console.log("Usage: devrun [devrun-options] <script> [script-args]");

  console.log(`
devrun-options:
  -v, --version                       Print the version and exit
  -h, --help                          Print this help message
  -f, --function <name>               The function to run inside the script
  -r, --require <id>                  Require a node module before execution
  --cwd <path>                        The current working directory to use for the script execution.
  --title <"title">                   The title to use for the script execution.
  --timed=true|false|1|0              Whether to time the script execution. Default is true.
  --stackTraceLimit=<n>               Set the stack trace limit. Default is ${Error.stackTraceLimit}.
  --nodeEventsMaxListeners=<n>        Set the max listeners for node events.
  --process-exit-timeout <ms> [code]  The timeout for the script execution. Default exit code is 1.
  --no-color                          Disable color output (forces process.env.NO_COLOR="true")
  --ci                                Enable CI mode (forces process.env.CI="true")

script:
  The script to run. This can be a path to a file or a node module.

script-args:
  Arguments to pass to the script. These are passed to the script as-is in argv[2] and beyond.

Examples:
  devrun -f myFunction -r scriptToRequireBefore ./my-script.js arg1 arg2

If you need to pass options to node, you can
`);
}

interface ParsedArguments {
  require: string[];
  timed: boolean;
  function: string;
  title: string;
  processExitTimeout:
    | {
        milliseconds: number;
        exitCode?: number | undefined;
      }
    | undefined;
  nodeEventsMaxListeners: number | undefined;
  stackTraceLimit: number | undefined;
  script: string;
  scriptArgs: string[];
  noColor: boolean;
  ci: boolean;
}

function parseArguments(): ParsedArguments {
  const args = process.argv.slice(2);
  const options: ParsedArguments = {
    require: [],
    timed: true,
    function: "",
    title: "",
    processExitTimeout: undefined,
    nodeEventsMaxListeners: undefined,
    stackTraceLimit: undefined,
    script: "",
    scriptArgs: [],
    noColor: false,
    ci: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-v" || arg === "--version") {
      const { name, version } = require("../package.json");
      console.log(`${name}@${version}`);
      process.exit(0);
    } else if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(1);
    } else if (arg === "-r" || arg === "--require") {
      const requireId = args[++i];
      if (requireId) {
        options.require.push(requireId);
      }
    } else if (arg === "-f" || arg === "--function") {
      const functionName = args[++i];
      if (!functionName) {
        console.error("No function name specified\n");
        process.exit(1);
      }
      options.function = functionName;
    } else if (arg === "--timed=true" || arg === "--timed=1" || arg === "--timed") {
      options.timed = true;
    } else if (arg === "--timed=false" || arg === "--timed=0") {
      options.timed = false;
    } else if (arg === "-t" || arg === "--process-exit-timeout") {
      const timeout = args[++i];
      if (!timeout) {
        console.error("No timeout specified\n");
        process.exit(1);
      }
      const timeoutValue = Number.parseInt(timeout);
      if (!isFinite(timeoutValue)) {
        console.error("Invalid timeout specified\n");
        process.exit(1);
      }
      options.processExitTimeout = { milliseconds: timeoutValue };
      // Check if exit code can be parsed as an integer
      const timeoutExitCode = args[i + 1];
      if (timeoutExitCode && /^\d+$/.test(timeoutExitCode)) {
        i++;
        options.processExitTimeout.exitCode = Number.parseInt(timeoutExitCode);
      }
    } else if (arg === "--title") {
      const title = args[++i];
      if (!title) {
        console.error("No title specified\n");
        process.exit(1);
      }
      options.title = title;
    } else if (arg === "--cwd") {
      const cwd = args[++i];
      if (!cwd) {
        console.error("No cwd specified\n");
        process.exit(1);
      }
      process.chdir(cwd);
    } else if (arg === "--no-color") {
      options.noColor = true;
    } else if (arg && arg.startsWith("--nodeEventsMaxListeners=")) {
      const maxListeners = Number.parseInt(arg.substr("--nodeEventsMaxListeners=".length));
      if (isNaN(maxListeners)) {
        console.error("Invalid max listeners specified\n");
        process.exit(1);
      }
      options.nodeEventsMaxListeners = maxListeners;
    } else if (arg === "--ci") {
      options.ci = true;
    } else if (arg && arg.startsWith("--stackTraceLimit=")) {
      const stackTraceLimit = Number.parseInt(arg.substr("--stackTraceLimit=".length));
      if (isNaN(stackTraceLimit)) {
        console.error("Invalid stack trace limit specified\n");
        process.exit(1);
      }
      options.stackTraceLimit = stackTraceLimit;
      Error.stackTraceLimit = stackTraceLimit;
    } else {
      options.script = arg || "";
      options.scriptArgs = args.slice(i + 1);
      break;
    }
  }

  if (!options.script) {
    console.error("No script specified\n");
    printHelp();
    process.exit(1);
  }

  return options;
}

class MainModule extends Module {
  load!: (filename: string) => void;

  constructor(filename: string) {
    super(filename, module);
    this.filename = filename;
    this.paths = (Module as UnsafeAny)._nodeModulePaths(process.cwd());

    let exportsError: unknown = this;
    let exportsLoaded = false;
    let exports = this.exports;

    const oldLoad = this.load;
    this.load = (): void => {
      this.loaded = true;
    };

    Object.defineProperty(this, "exports", {
      get: () => {
        if (exportsLoaded) {
          if (exportsError !== this) {
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
          exportsLoaded = false;
          exportsError = e;
          throw e;
        } finally {
          if (wasLoaded) {
            this.loaded = true;
          }
          if (hadCache) {
            require.cache[filename] = this;
          }
        }
        return exports;
      },
      set: (value) => {
        if (value !== undefined && value !== exports) {
          exports = value;

          exportsLoaded = true;
          exportsError = undefined;
        }
      },
      configurable: true,
      enumerable: true,
    });
  }
}

function devrun(): void {
  if (Error.stackTraceLimit < DEFAULT_STACK_TRACE_LIMIT) {
    Error.stackTraceLimit = DEFAULT_STACK_TRACE_LIMIT;
  }

  const options = parseArguments();

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

  require("../init-ts-node");

  const mainModule = new MainModule(script);
  require.cache[mainModule.filename] = mainModule;
  mainModule.loaded = true;
  process.mainModule = mainModule;

  process.argv = [process.argv[0]!, mainModule.filename, ...options.scriptArgs];

  const balsamicDevMain: typeof import("../main") = require("../main");
  void balsamicDevMain.devRunMain(mainModule, {
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

devrun();
