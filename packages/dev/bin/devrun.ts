#!/usr/bin/env node

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

if (Error.stackTraceLimit < DEFAULT_STACK_TRACE_LIMIT) {
  Error.stackTraceLimit = DEFAULT_STACK_TRACE_LIMIT;
}

const options = parseArguments();

require("../init-ts-node");

require("../main/devrun-implementation").devrun(options);

export default undefined;
