"use strict";

const { Module } = require("module");
const {
  join: pathJoin,
  extname: pathExtname,
  fileURLToPath,
  isAbsolute: pathIsAbsolute,
  resolve: pathResolve,
} = require("path");
const { pathToFileURL } = require("url");

/** @returns {import('fast-glob')} */
let _getFastGlob = () => {
  const result = require("fast-glob");
  _getFastGlob = () => result;
  return result;
};

Reflect.defineProperty(exports, "__esModule", { value: true });
Reflect.defineProperty(exports, "default", { value: exports });

exports.esrunMain = function esrunMain() {
  const esrun = require("./index.js");

  process.on("uncaughtException", esrun.handleUncaughtError);

  if (!_hasLoader()) {
    return _forkRestart();
  }

  esrun.esrunRegister();

  _fixEnv();

  require("v8-compile-cache");

  return _esrun(esrun);
};

async function _esrun(esrun) {
  try {
    const options = await _parseArgv(esrun);
    if (!options) {
      return;
    }

    const { measureTime, main, includes, bundle } = options;

    esrun.esrunRegister({ errors: true, exit: measureTime });

    const resolveDir = process.cwd();
    const mainEntries = await _resolveEntries(esrun, main, resolveDir);

    if (mainEntries.length === 1) {
      process.argv[1] = mainEntries[0];
    }

    let filesToInclude;
    if (includes.length > 0) {
      filesToInclude = await _getIncludesEntries(esrun, includes, mainEntries, resolveDir);
    }

    for (const mainEntry of mainEntries) {
      esrun.addMainModule(mainEntry);
    }

    if (bundle) {
      const generateSource = (array) =>
        array ? `${array.map((x) => `import ${JSON.stringify(x)}\n`).join("\n")}\n` : "";

      const code = generateSource(filesToInclude) + generateSource(mainEntries);

      await esrun.esrunEval(code, {
        bundle: true,
        isMain: true,
        callerUrl: pathToFileURL(pathResolve("index.js")).href,
      });
    } else {
      if (filesToInclude) {
        await Promise.all(filesToInclude.map((file) => import(file)));
      }
      for (const mainEntry of mainEntries) {
        await import(mainEntry);
      }
    }
  } catch (error) {
    esrun.emitUncaughtException(error);
  }
}

async function _getIncludesEntries(esrun, includes, mainEntries, resolveDir) {
  const promises = [];

  const set = new Set();

  const _includeFile = async (include) => {
    set.add(await _resolveEntryModule(include, resolveDir));
  };

  const _includeFiles = (items) => {
    for (const item of items) {
      if (esrun.getLoader(pathExtname(item)) !== undefined) {
        promises.push(_includeFile(item));
      }
    }
  };

  const exclusions = [];
  for (const item of includes) {
    if (item.startsWith("!")) {
      exclusions.push(item);
    }
  }

  for (let item of includes) {
    if (item.startsWith("!")) {
      continue;
    }
    if (item.startsWith("file://")) {
      item = fileURLToPath(item) || item;
    }
    if (item.indexOf("*") < 0 && item.indexOf("?") < 0) {
      promises.push(_includeFile(item));
    } else {
      promises.push(
        _getFastGlob()([item, ...exclusions, "!**/.git/**"], {
          absolute: true,
          cwd: resolveDir,
          onlyFiles: true,
          dot: true,
        }).then(_includeFiles),
      );
    }
  }

  if (promises.length !== 0) {
    await Promise.all(promises);
  }

  for (const mainEntry of mainEntries) {
    set.delete(mainEntry);
  }

  return Array.from(set);
}

async function _resolveEntries(esrun, entry, resolveDir) {
  if (entry.startsWith("file://")) {
    entry = fileURLToPath(entry) || entry;
  }
  if (entry.indexOf("*") >= 0 || entry.indexOf("?") >= 0) {
    const entries = await _getFastGlob()([entry, "!**/node_modules/**", "!**/.git/**"], {
      absolute: true,
      cwd: resolveDir,
      onlyFiles: true,
      dot: false,
    });
    const promises = [];
    for (const found of entries) {
      if (esrun.getLoader(pathExtname(found))) {
        promises.push(_resolveEntryModule(esrun, entry, resolveDir));
      }
    }
    return Promise.all(promises);
  }

  return [await _resolveEntryModule(esrun, entry, resolveDir)];
}

async function _resolveEntryModule(esrun, entry, resolveDir) {
  if (!entry.startsWith("./") && !entry.startsWith(".\\") && !entry.startsWith("/") && !entry.startsWith("\\")) {
    try {
      return await esrun.resolveEsModule(`./${entry}`, pathJoin(resolveDir, "index.js"));
    } catch {}
  }
  try {
    return await esrun.resolveEsModule(entry, pathJoin(resolveDir, "index.js"));
  } catch {}
  return entry;
}

function _setupMocha(esrun) {
  let mochaRequire;
  try {
    mochaRequire = Module.createRequire(
      Module.createRequire(pathJoin(process.cwd(), "index.js")).resolve("mocha/package.json"),
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
      file = esrun.pathNameFromUrl(file);
    }
    if (pathIsAbsolute(file)) {
      try {
        return await import(esrun.pathNameToUrl(file));
      } catch (err) {
        // This is a hack created because ESM in Node.js (at least in Node v15.5.1) does not emit
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

async function _parseArgv(esrun) {
  let measureTime = false;
  let mocha = false;
  let bundle = false;
  const includes = new Set();

  const inputArgv = process.argv.slice();
  const finalArgs = [inputArgv[0], inputArgv[1]];

  let i = 2;
  for (; i < inputArgv.length; ++i) {
    const arg = inputArgv[i];
    if (arg.startsWith("-r=")) {
      const include = arg.slice("-r=".length);
      if (include) {
        includes.add(include);
      }
    } else if (arg.startsWith("--require=")) {
      const include = arg.slice("--require=".length);
      if (include) {
        includes.add(include);
      }
    } else if (arg === "-r" || arg === "--require") {
      const include = inputArgv[++i];
      if (!include) {
        includes.add(include);
      }
    } else if (arg === "--bundle") {
      bundle = true;
    } else if (arg === "--no-bundle") {
      bundle = false;
    } else if (arg === "--time") {
      measureTime = true;
    } else if (arg === "--no-time") {
      measureTime = false;
    } else if (arg === "--mocha") {
      mocha = true;
      ++i;
      break;
    } else {
      break;
    }
  }

  for (; i < inputArgv.length; ++i) {
    finalArgs.push(inputArgv[i]);
  }

  let main;
  if (mocha) {
    if (finalArgs.includes("--watch")) {
      throw new Error("Watch mode for mocha not supported with ESM modules");
    }
    if (bundle) {
      throw new Error("--mocha cannot be used together with --bundle");
    }
    main = _setupMocha(esrun);
  } else {
    main = finalArgs[2];
    if (main !== undefined) {
      finalArgs.splice(2, 1);
    }
  }

  if (main) {
    finalArgs[1] = main;
  }

  process.argv.length = 0;
  process.argv.push(...finalArgs);

  if (!main || (!mocha && (main === "--help" || main === "--version"))) {
    const { printHelp, printVersion } = require("./lib/esrun-main-help.js");
    if (main === "--version") {
      printVersion();
    } else {
      printHelp();
      process.exitCode = 1;
    }
    return undefined;
  }

  return {
    measureTime,
    bundle,
    mocha,
    includes: Array.from(includes),
    main,
    originalArgs: inputArgv.slice(2),
  };
}

function _hasLoader() {
  const array = [...process.execArgv, ...(process.env.NODE_OPTIONS || "").split(" ")];
  for (const item of array) {
    if (item.startsWith("--loader=") || item.startsWith("--experimental-loader=")) {
      return true;
    }
  }
  return false;
}

function _generateFlags(result) {
  const set = new Set(result);

  if (!set.has("--require=@balsamic/esrun/register.cjs")) {
    result.push("--require=@balsamic/esrun/register.cjs");
  }

  let hasLoader = false;
  for (const item of result) {
    if (item.startsWith("--loader=") || item.startsWith("--experimental-loader=")) {
      hasLoader = true;
      break;
    }
  }
  if (!hasLoader) {
    result.push("--loader=@balsamic/esrun/loader.mjs");
  }

  const { allowedNodeEnvironmentFlags } = process;
  if (allowedNodeEnvironmentFlags.has("--import-meta-resolve")) {
    if (!set.has("--import-meta-resolve")) {
      result.push("--import-meta-resolve");
    }
  } else if (allowedNodeEnvironmentFlags.has("--experimental-import-meta-resolve")) {
    if (!set.has("--experimental-import-meta-resolve")) {
      result.push("--experimental-import-meta-resolve");
    }
  }

  return result;
}

function _fixEnv() {
  process.env.NODE_OPTIONS = _generateFlags((process.env.NODE_OPTIONS || "").split(" ")).join(" ");
  _generateFlags(process.execArgv);
}

function _forkRestart() {
  return new Promise((resolve) => {
    _fixEnv();
    const child_process = require("child_process");
    const child = child_process.fork(process.argv[1], process.argv.slice(2), {
      stdio: "inherit",
      execArgv: process.execArgv,
      serialization: "advanced",
      env: process.env,
    });

    child.on("close", (code) => {
      process.exitCode = code;
      resolve(code);
    });

    child.on("error", (e) => {
      console.error(e);
      process.exitCode = 1;
      resolve(1);
    });

    if (process.send) {
      child.on("message", (msg) => {
        process.send(msg);
      });
    }

    process.on("message", (msg) => {
      child.send(msg);
    });
  });
}

if (require.main === module) {
  void this.esrunMain();
}
