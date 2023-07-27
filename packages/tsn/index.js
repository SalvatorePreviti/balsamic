/* eslint-disable global-require */
/* eslint-disable no-console */
const Module = require("node:module");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const fs = require("node:fs");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const _initializedSym = Symbol.for("@balsamic/tsn");

let tsn;

if (global[_initializedSym]) {
  // eslint-disable-next-line node/no-exports-assign
  exports = global[_initializedSym];

  module.exports = exports;

  tsn = exports.tsn;
} else {
  const cwdRequire = Module.createRequire(path.resolve(process.cwd(), "index.js"));

  const tryRequire = (id) => {
    try {
      return cwdRequire(id);
    } catch (e) {
      if (e.code === "MODULE_NOT_FOUND") {
        try {
          Module.createRequire(process.argv[1] || require.main?.filename || __filename)(id);
        } catch (e1) {
          if (e1.code === "MODULE_NOT_FOUND") {
            try {
              // eslint-disable-next-line global-require
              return require(id);
            } catch {}
          }
        }
      }
    }
    return undefined;
  };

  const tryResolve = (id) => {
    try {
      return cwdRequire.resolve(id);
    } catch (e) {
      if (e.code === "MODULE_NOT_FOUND") {
        try {
          return Module.createRequire(process.argv[1] || require.main?.filename || __filename).resolve(id);
        } catch {
          try {
            // eslint-disable-next-line global-require
            return require.resolve(id);
          } catch {}
        }
      }
    }
    return undefined;
  };

  let _chalk;
  let _version;
  let _isProcessTimed = false;
  let _isCI;
  let _colorsLevel;
  let _processTitle;
  let _colors_disabled;
  let _appRootPath;

  if (process.env.TSN_TIMED === "1" || process.env.TSN_TIMED === "true") {
    _isProcessTimed = true;
    process.env.TSN_TIMED = "";
    process.once("exit", _processTimeExit);
  }

  tsn = {
    v: 1,

    initialCwd: process.cwd(),

    get patchMocha() {
      return patchMocha;
    },

    get tryRequire() {
      return tryRequire;
    },

    get tryResolve() {
      return tryResolve;
    },

    get loadDotEnv() {
      return loadDotEnv;
    },

    get version() {
      return _version || (_version = require("./package.json").version);
    },

    get appRootPath() {
      return _appRootPath || (_appRootPath = require("app-root-path").path);
    },

    set appRootPath(value) {
      _appRootPath = value || undefined;
    },

    get colors() {
      if (!_chalk) {
        _chalk = tryRequire("chalk") || require("chalk");
        _chalk.level = tsn.colorsLevel;
      }
      return _chalk;
    },

    set colors(value) {
      _chalk = value;
    },

    get colors_disabled() {
      return _colors_disabled || (_colors_disabled = new tsn.colors.Instance({ level: 0 }));
    },

    set colors_disabled(value) {
      _colors_disabled = value;
    },

    get colorsLevel() {
      let result = _colorsLevel;
      if (result === undefined) {
        result = _loadHasColors();
        _colorsLevel = result;
      }
      return result;
    },

    set colorsLevel(value) {
      if (typeof value === "string") {
        value = Number.parseInt(value);
      }
      _colorsLevel = !value ? 0 : value === true ? 1 : value > 0 ? (value < 3 ? value | 0 : 3) : 0;
    },

    get stderrColorsLevel() {
      let result = _colorsLevel;
      if (result === undefined) {
        result = _loadHasColors(process.stderr);
        _colorsLevel = result;
      }
      return result;
    },

    set stderrColorsLevel(value) {
      if (typeof value === "string") {
        value = Number.parseInt(value);
      }
      _colorsLevel = !value ? 0 : value === true ? 1 : value > 0 ? (value < 3 ? value | 0 : 3) : 0;
    },

    get isCI() {
      if (_isCI === undefined) {
        const { CI, GITHUB_ACTIONS, TF_BUILD } = process.env;
        _isCI =
          (!!CI && CI !== "false" && CI !== "0") ||
          (!!GITHUB_ACTIONS && GITHUB_ACTIONS !== "false" && GITHUB_ACTIONS !== "0") ||
          TF_BUILD === "True" ||
          process.argv.includes("--ci");
      }
      return _isCI;
    },

    set isCI(value) {
      _isCI = value ? true : value === null || value === undefined ? undefined : false;
    },

    get isProcessTimed() {
      return _isProcessTimed;
    },

    set isProcessTimed(value) {
      _isProcessTimed = value;
    },

    get processTitle() {
      let result = _processTitle;
      if (result === undefined) {
        result = _processTitle;
        if (result === undefined) {
          result = _extrapolateProcessTitle(process.mainModule || process.argv[1]) || "script";
          _processTitle = result;
          return result;
        }
      }
      return result;
    },

    set processTitle(title) {
      _processTitle = _extrapolateProcessTitle(title);
    },

    get hasProcessTitle() {
      return _processTitle !== undefined;
    },
  };

  global[_initializedSym] = tsn;

  exports.tsn = tsn;

  const processEmit = process.emit;
  const emit = (...args) => {
    const name = args[0];
    if (name === "warning") {
      const data = args[1];
      if (data && data.name === "ExperimentalWarning" && data.message.includes("Custom ESM Loaders")) {
        // Ignore Custom ESM Loaders experimental warning
        return false;
      }
    }
    return processEmit.apply(process, args);
  };
  process.emit = emit;

  if (!process.env.TSN_NO_DOTENV) {
    process.env.TSN_NO_DOTENV = "1";
    loadDotEnv();
  }

  if (!("FORCE_COLOR" in process.env)) {
    process.env.FORCE_COLOR = _loadHasColors().toString();
  }

  const nodeOptions = process.env.NODE_OPTIONS || "";

  if (!nodeOptions.includes("--enable-source-maps")) {
    process.env.NODE_OPTIONS = `--enable-source-maps ${process.env.NODE_OPTIONS}`;
  }

  if (!nodeOptions.includes("@balsamic/tsn")) {
    process.env.NODE_OPTIONS = `-r @balsamic/tsn --loader @balsamic/tsn ${nodeOptions}`;
  }

  const execArgv = process.execArgv || [];
  let hasRequireTsnArg = false;
  let hasLoaderTsnArg = false;
  let hasEnableSourceMapsArg = false;
  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];
    if ((arg === "-r" && execArgv[i + 1] === "@balsamic/tsn") || arg === "--require=@balsamic/tsn") {
      hasRequireTsnArg = true;
    } else if (arg === "--loader" && execArgv[i + 1] === "@balsamic/tsn") {
      hasLoaderTsnArg = true;
    } else if (arg === "--enable-source-maps") {
      hasEnableSourceMapsArg = true;
    }
  }

  if (!hasLoaderTsnArg) {
    process.execArgv.unshift("@balsamic/tsn");
    process.execArgv.unshift("--loader");
  }

  if (!hasRequireTsnArg) {
    process.execArgv.unshift("@balsamic/tsn");
    process.execArgv.unshift("-r");
  }

  if (!hasEnableSourceMapsArg) {
    process.execArgv.unshift("--enable-source-maps");
  }

  tryRequire("ts-node/register/transpile-only");
  tryRequire("tsconfig-paths/register");

  // Custom arguments

  const argv = process.argv;

  if (!require.main) {
    const requiredMain = process.argv[1] || "";

    if (requiredMain === path.resolve("mocha")) {
      const resolved = tsn.tryResolve("mocha/bin/mocha.js");
      if (resolved) {
        patchMocha();
        argv[1] = resolved;
      }
    } else if (requiredMain === path.resolve("spawn")) {
      argv[1] = __filename;

      // Spawn a new process
      const child = spawnSync(process.argv[2], process.argv.slice(3), { stdio: "inherit", shell: true });

      if (child.error) {
        throw child.error;
      }

      if (child.status) {
        process.exitCode = child.status;
      }
    } else if (requiredMain === path.resolve("tscheck") || requiredMain === path.resolve("typecheck")) {
      argv[1] = require.resolve("./tscheck/tscheck.js");
    }
  }
}

function _processTimeExit() {
  try {
    const millisecondsToString = (milliseconds) => {
      milliseconds = +milliseconds;
      if (!isFinite(milliseconds)) {
        return `${milliseconds}`;
      }

      const isNegative = milliseconds < 0;
      if (isNegative) {
        milliseconds = -milliseconds;
      }

      let n = milliseconds / 1000;

      let str = "";
      for (const { unit, amount } of [
        { unit: "y", amount: 60 * 60 * 24 * 365.25 },
        { unit: "d", amount: 60 * 60 * 24 },
        { unit: "h", amount: 60 * 60 },
        { unit: "m", amount: 60 },
        { unit: "s", amount: 1 },
        { unit: "ms", amount: 1 / 1000 },
      ]) {
        const v =
          unit === "ms"
            ? milliseconds > 500
              ? Math.round(n / amount)
              : Math.round((n / amount) * 100) / 100
            : Math.floor(n / amount);
        if (v) {
          str += `${v}${unit} `;
        }
        n -= v * amount;
      }
      return str.length > 0 ? (isNegative ? "-" : "") + str.trim() : `0ms`;
    };

    let chalk;

    try {
      chalk = exports.chalk;
    } catch {}

    const elapsed = millisecondsToString(process.uptime() * 1000);
    const exitCode = process.exitCode;

    if (chalk) {
      if (exitCode) {
        console.error(
          chalk.redBright(`\n😡 ${chalk.redBright.bold.underline("FAILED")} in ${elapsed}. exitCode: ${exitCode}\n`),
        );
      } else {
        console.log(chalk.greenBright(`\n✅ ${chalk.bold("OK")} ${chalk.green(`in ${elapsed}`)}\n`));
      }
    } else if (exitCode) {
      console.error(`\n- FAILED in ${elapsed}. exitCode: ${exitCode}\n`);
    } else {
      console.log(chalk.greenBright(`\n- OK in ${elapsed}\n`));
    }
  } catch {}
}

function _loadHasColors(stream = process.stdout) {
  let result = 0;

  const argv = process.argv;
  const env = process.env;

  const hasNoColorArg = argv.includes("--no-color") || argv.includes("--no-colors");
  const hasNoColorEnv = !!env.NO_COLOR && env.NO_COLOR !== "false";

  if (!hasNoColorArg && !hasNoColorEnv) {
    switch (env.FORCE_COLOR) {
      case "0":
      case "false":
      case "False":
      case "FALSE":
      case "no":
      case "No":
      case "NO":
      case "n":
      case "N":
        return 0;
      case "1":
      case "4":
      case "16":
      case "true":
      case "True":
      case "TRUE":
      case "yes":
      case "Yes":
      case "YES":
      case "Y":
      case "y":
        result = 1;
        break;
      case "2":
      case "8":
      case "256":
        result = 2;
        break;
      case "3":
      case "24":
      case "16M":
        result = 3;
        break;

      default:
        break;
    }

    if (stream && typeof stream.hasColors === "function") {
      const hasColors24 = stream.hasColors(2 ** 24);
      const hasColors8 = stream.hasColors(2 ** 8);
      const hasColors = stream.hasColors();
      const level = hasColors24 ? 3 : hasColors8 ? 2 : hasColors ? 1 : 0;

      if (level && level >= result) {
        result = level;
      }
    } else if (!result && exports.isCI) {
      result = 1;
    }
  }

  return result;
}

function _extrapolateProcessTitle(value) {
  if (typeof value === "object" && value !== null) {
    let fname = value.filename;
    if (typeof fname !== "string" || !fname) {
      fname = value.path;
      if (typeof fname !== "string" || !fname) {
        fname = value.id;
      }
    }
    if (fname) {
      value = fname;
    }
  }
  if (typeof value !== "string" || !value || value === "." || value === "./") {
    return undefined;
  }
  if (/^file:\/\//i.test(value)) {
    value = fileURLToPath(value);
  }
  if (value.startsWith("/")) {
    value = makePathRelative(value, tsn.initialCwd) || value;
  }
  return value;
}

/** Makes a path relative and nicely printable */
function makePathRelative(filePath, cwdOrOptions) {
  if (!filePath) {
    return "./";
  }
  let cwd;
  let startDot;
  if (typeof cwdOrOptions === "string") {
    cwd = cwdOrOptions;
  } else if (typeof cwdOrOptions === "object" && cwdOrOptions !== null) {
    cwd = cwdOrOptions.cwd;
    startDot = cwdOrOptions?.startDot;
  }
  if (!cwd || cwd === "." || cwd === "./") {
    cwd = process.cwd();
  }
  filePath = `${filePath}`;
  let result;
  try {
    const relativePath = path.normalize(path.relative(cwd, filePath));
    result = relativePath && relativePath.length < filePath.length ? relativePath : filePath;
  } catch {
    result = filePath;
  }
  if (!startDot) {
    return result;
  }
  if (path.isAbsolute(result) || result.startsWith("./") || result.includes(":")) {
    return result;
  }
  return `./${result}`;
}

/** Loads .env file */
function loadDotEnv(dotenvPath) {
  try {
    if (dotenvPath === false) {
      return false;
    }

    const REGEX_NEWLINE = "\n";
    const REGEX_NEWLINES = /\\n/g;
    const REGEX_NEWLINES_MATCH = /\r\n|\n|\r/;
    const REGEX_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;

    dotenvPath = (typeof dotenvPath === "string" ? dotenvPath : this.env.DOTENV_CONFIG_PATH) || path.resolve(".env");
    dotenvPath = dotenvPath.startsWith("~")
      ? path.resolve(os.homedir(), dotenvPath.slice(dotenvPath.startsWith("/") || dotenvPath.startsWith("\\") ? 2 : 1))
      : dotenvPath;

    for (const line of fs.readFileSync(dotenvPath, "utf8").split(REGEX_NEWLINES_MATCH)) {
      const keyValueArr = REGEX_INI_KEY_VAL.exec(line);
      if (keyValueArr !== null) {
        const key = keyValueArr[1];
        let val = (keyValueArr[2] || "").trim();
        const singleQuoted = val.startsWith("'") && val.endsWith("'");
        const doubleQuoted = val.startsWith('"') && val.endsWith('"');
        if (singleQuoted || doubleQuoted) {
          val = val.substring(1, val.length - 1);
          if (doubleQuoted) {
            val = val.replace(REGEX_NEWLINES, REGEX_NEWLINE);
          }
        }
        if (!Object.prototype.hasOwnProperty.call(this.env, key)) {
          this.env[key] = val;
        }
      }
    }
    return true;
  } catch (_e) {
    // Do nothing
  }
  return false;
}

function patchMocha() {
  let mochaRequire;
  try {
    mochaRequire = Module.createRequire(
      Module.createRequire(path.resolve(process.cwd(), "index.js")).resolve("mocha/package.json"),
    );
  } catch (e) {
    try {
      mochaRequire = Module.createRequire(require.resolve("mocha/package.json"));
    } catch {
      throw e;
    }
  }

  const mochaTryRequire = (id) => {
    try {
      return mochaRequire(id);
    } catch {
      return undefined;
    }
  };

  // Patch mocha to always use esm import

  const esmUtils = mochaTryRequire("./lib/esm-utils.js") || mochaRequire("./lib/nodejs/esm-utils.js", false);
  esmUtils.requireOrImport = async (file) => {
    if (file.startsWith("file://")) {
      file = fileURLToPath(file);
    }
    if (path.isAbsolute(file)) {
      try {
        return await import(pathToFileURL(file));
      } catch (err) {
        // This is a hack created because ESM in Node.js does not emit
        // the location of the syntax error in the error thrown.
        // This is problematic because the user can't see what file has the problem,
        // so we add the file location to the error.
        // This `if` should be removed once Node.js fixes the problem.
        if (err instanceof SyntaxError && err.message && err.stack && !err.stack.includes(file)) {
          const newErrorWithFilename = new SyntaxError(err.message);
          newErrorWithFilename.stack = err.stack.replace(/^SyntaxError/, `SyntaxError[ @${file} ]`);
          throw newErrorWithFilename;
        }
        throw err;
      }
    }
    return import(file);
  };

  return mochaRequire.resolve("./bin/mocha");
}
