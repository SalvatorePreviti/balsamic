import { extname } from "path";

import esrun from "./index.js";
import { Module } from "module";
import { readFile } from "fs/promises";
import { init as esModuleLexerInit, parse as esModuleLexerParse } from "es-module-lexer";

const { isArray } = Array;
const { stringify: JSONstringify } = JSON;
const { getOwnPropertyNames, getPrototypeOf } = Object;

const _fileIsCjsModuleCache = new Map();
let _esModuleLexerInitialized = false;

esrun.esrunRegister();

export async function resolve(specifier, context, defaultResolve) {
  try {
    const resolved = await esrun.resolveEsModule(specifier, context.parentURL);
    if (resolved) {
      return { url: resolved };
    }
  } catch {}

  return defaultResolve(specifier, context, defaultResolve);
}

export async function getFormat(url, context, defaultGetFormat) {
  const evalModule = esrun._evalModuleTemp.get(url);
  if (evalModule !== undefined) {
    return evalModule;
  }

  const pathname = esrun.pathNameFromUrl(url);

  let result;
  if (pathname) {
    const loader = esrun.getLoader(extname(pathname));
    if (loader) {
      result = { format: loader.format };
    }
  }

  if (!result) {
    result = await defaultGetFormat(url, context, defaultGetFormat);
  }

  if (result.format === "commonjs") {
    if (extname(pathname) === ".js" && (await _fileIsEsModule(pathname))) {
      // Extension is .js, the package was configured as commonjs but the module is an es6 module!
      return { format: "module" };
    }
    _fileIsCjsModuleCache.set(url, true);
    return { format: "module" };
  }
  return result;
}

export async function getSource(url, context, defaultGetSource) {
  const evalModule = esrun._evalModuleTemp.get(url);
  if (evalModule !== undefined) {
    return evalModule;
  }

  if (context.format === "module" && _fileIsCjsModuleCache.get(url)) {
    const pathName = esrun.pathNameFromUrl(url);
    if (pathName) {
      const exports = Module.createRequire(pathName)(pathName);
      const source = _esrunTransformCjsModule(pathName, exports);
      return { source };
    }
  }
  return defaultGetSource(url, context, defaultGetSource);
}

export async function transformSource(source, context, defaultTransformSource) {
  const url = context && context.url;
  if (!_fileIsCjsModuleCache.get(url)) {
    const evalModule = esrun._evalModuleTemp.get(url);
    const pathName = esrun.pathNameFromUrl(url);
    const loader = evalModule ? esrun.getLoader(evalModule.extension) : pathName && esrun.getLoader(extname(pathName));
    if (loader && loader.transformModule) {
      const transformed = await loader.transformModule({
        ...evalModule,
        source,
        url,
        pathName,
        context,
      });
      if (transformed) {
        source = transformed.source;
        if (transformed.map) {
          esrun.setFileSourceMap(url, pathName, transformed.map);
        }
      }
    }
  }
  return defaultTransformSource(source, context, defaultTransformSource);
}

function _esrunTransformCjsModule(pathName, exports) {
  let source = `import __$esrun__M from 'module';const __$esrun__N=${JSONstringify(
    pathName,
  )},__$esrun__C=__$esrun__M._cache[__$esrun__N],__$esrun__J=__$esrun__C?__$esrun__C.exports:__$esrun__M.createRequire(import.meta.url)(__$esrun__N);`;
  if (typeof exports === "object" && exports !== null && !isArray(exports)) {
    const keysSet = new Set();
    let hasDefault = false;
    for (let i = 0, curr = exports; curr && i < 256; ++i) {
      const props = getOwnPropertyNames(curr);
      for (const prop of props) {
        if (
          typeof prop === "string" &&
          !keysSet.has(prop) &&
          esrun.isValidIdentifier(prop) &&
          !prop.startsWith("__$esrun__")
        ) {
          keysSet.add(prop);
        } else if (prop === "default") {
          hasDefault = true;
        }
      }
      curr = getPrototypeOf(curr);
    }

    if (hasDefault && keysSet.has("__esModule")) {
      source += "export default __$esrun__J.default;";
    } else {
      source += "export default __$esrun__J;";
    }

    keysSet.delete("__esModule");

    if (keysSet.size > 0) {
      source += `export const {${Array.from(keysSet).join(",")}}=__$esrun__J;`;
    }
  } else {
    source += "export default __$esrun__J;";
  }

  return source;
}

async function _fileIsEsModule(filename) {
  if (!_esModuleLexerInitialized) {
    await esModuleLexerInit;
    _esModuleLexerInitialized = true;
  }
  let result = _fileIsCjsModuleCache.get(filename);
  if (result !== undefined) {
    return !result;
  }

  result = false;
  try {
    const parsed = esModuleLexerParse(await readFile(filename, "utf8"));

    if (parsed[1].length > 0) {
      result = true;
    } else {
      const imports = parsed[0];
      for (let i = 0, len = imports.length; i < len; ++i) {
        if (imports[i].d === -1) {
          result = true;
          break;
        }
      }
    }
  } catch (_) {
    // Ignore error
  }

  _fileIsCjsModuleCache.set(filename, !result);
  return result;
}
