'use strict'

const vm = require('vm')

const { pathToFileURL, fileURLToPath } = require('url')
const errors = require('./errors.js')
const Module = require('module')
const {
  dirname: pathDirname,
  resolve: pathResolve,
  join: pathJoin,
  extname: pathExtname,
  sep: pathSep,
  isAbsolute: pathIsAbsolute
} = require('path')
const fs = require('fs')

const { isArray } = Array
const { isBuffer } = Buffer
const { stringify: JSONstringify } = JSON
const _Error = Error
const { captureStackTrace } = _Error

let _registered = false
let _sourceMapSupportRegistered = false

const _mainEntries = new Set()
const _resolveCache = new Map()
const _builtinModules = new Map()
const _sourceMaps = new Map()
const _loaders = new Map()
const _extensionlessLoaders = []
const _emptyContents = { contents: '' }
const _allFilesFilter = { filter: /.*/ }
const _nodeTargetVersion = `node${process.version.slice(1)}`

/** @returns {import('esbuild')} */
let _getEsBuild = () => {
  const result = require('esbuild')
  _getEsBuild = () => result
  return result
}

/** @returns {import('source-map-support')} */
let _getSourceMapSupport = () => {
  const result = require('source-map-support')
  _getSourceMapSupport = () => result
  return result
}

let _getLoaders = () => {
  _getLoaders = () => _loaders

  const __filenameUrl = pathToFileURL(__filename).href
  _resolveCache.set(__filename, __filenameUrl)
  _resolveCache.set(__dirname, __filenameUrl)
  _resolveCache.set('@balsamic/esrun/index.js', __filenameUrl)
  _resolveCache.set('@balsamic/esrun/index', __filenameUrl)
  _resolveCache.set('@balsamic/esrun', __filenameUrl)
  const resolvedEsrunCjs = pathJoin(__dirname, 'esrun.js')
  _resolveCache.set(resolvedEsrunCjs, pathToFileURL(resolvedEsrunCjs).href)

  exports.registerLoader([
    { extension: '.ts', loader: 'ts', extensionless: true },
    { extension: '.tsx', loader: 'tsx', extensionless: true },
    { extension: '.jsx', loader: 'jsx', extensionless: true },
    { extension: '.mjs', loader: 'mjs', extensionless: true },
    { extension: '.js', loader: 'default', extensionless: true },
    { extension: '.es6', loader: 'mjs', extensionless: true },
    { extension: '.cjs', loader: 'cjs', extensionless: true },
    { extension: '.json', loader: 'json', extensionless: true },
    { extension: '.html', loader: 'text' },
    { extension: '.htm', loader: 'text' },
    { extension: '.txt', loader: 'text' },
    { extension: '.md', loader: 'text' },
    { extension: '.bin', loader: 'buffer' }
  ])
  return _loaders
}

Reflect.defineProperty(module.exports, '__esModule', { value: true })

exports.isRegistered = () => _registered

exports.loaders = {
  default: null,
  mjs: {
    format: 'module'
  },
  cjs: {
    format: 'commonjs'
  },
  ts: {
    format: 'module',
    transformModule: (source, pathName) => _esrunTranspileModuleAsync(source, pathName, 'ts'),
    transformCommonJS: (source, pathName) => _esrunTranspileCjsSync(source, pathName, 'ts')
  },
  tsx: {
    format: 'module',
    transformModule: (source, pathName) => _esrunTranspileModuleAsync(source, pathName, 'tsx'),
    transformCommonJS: (source, pathName) => _esrunTranspileCjsSync(source, pathName, 'tsx')
  },
  jsx: {
    format: 'module',
    transformModule: (source, pathName) => _esrunTranspileModuleAsync(source, pathName, 'jsx'),
    transformCommonJS: (source, pathName) => _esrunTranspileCjsSync(source, pathName, 'jsx')
  },
  json: {
    format: 'commonjs'
  },
  text: {
    format: 'commonjs',
    loadCommonJS: (_mod, pathName) => _cleanupText(fs.readFileSync(pathName, 'utf8'))
  },
  buffer: {
    format: 'commonjs',
    loadCommonJS: (_mod, pathName) => fs.readFileSync(pathName)
  }
}

exports.addMainEntry = (pathName) => {
  if (pathName) {
    _mainEntries.add(exports.pathNameFromUrl(pathName) || pathName)
  }
}

exports.handleUncaughtError = errors.handleUncaughtError

exports.emitUncaughtError = errors.emitUncaughtError

exports.registerSourceMapSupport = function registerSourceMapSupport() {
  if (_sourceMapSupportRegistered) {
    return false
  }

  _getSourceMapSupport().install({
    environment: 'node',
    handleUncaughtExceptions: false,
    hookRequire: true,
    retrieveSourceMap: (source) => _sourceMaps.get(source) || null
  })
  _sourceMapSupportRegistered = true
  return true
}

exports.register = function register() {
  if (_registered || global.__esrun_module) {
    return false
  }

  Reflect.defineProperty(global, '__esrun_module', {
    value: module,
    configurable: false,
    enumerable: false,
    writable: false
  })

  const _emitWarning = process.emitWarning

  function emitWarning(warning, name, ctor) {
    if (name === 'ExperimentalWarning') {
      // Disable all experimental warnings
      return undefined
    }
    return _emitWarning(warning, name, ctor || emitWarning)
  }

  process.emitWarning = emitWarning
  exports.registerSourceMapSupport()

  _fixVm()

  _registered = true

  for (const [k, v] of _getLoaders()) {
    _registerCommonjsLoader(k, v)
  }

  return true
}

/**
 * Check wether if the given module is the main module
 * @param url String url, Module or import.meta
 * @returns True if the given url, Module or import.meta is the main running module
 */
exports.isMainModule = function isMainModule(url) {
  if (typeof url === 'object') {
    if (url === require.main) {
      return true
    }
    url = url.filename || url.id || url.href || url.url
  }

  url = exports.pathNameFromUrl(url) || url

  if (!url || typeof url !== 'string') {
    return false
  }

  if (url.startsWith(pathSep)) {
    try {
      url = fileURLToPath(url)
    } catch (_) {}
  }

  const indexOfQuestionMark = url.indexOf('?')
  if (indexOfQuestionMark >= 0) {
    url = url.slice(0, indexOfQuestionMark - 1)
  }

  return _mainEntries.has(url)
}

exports.setFileSourceMap = function setFileSourceMap(url, sourcePath, map) {
  _sourceMaps.set(url, { url: sourcePath, map })
}

exports.getLoader = function getLoader(extension) {
  if (typeof extension !== 'string') {
    return undefined
  }
  if (extension.length === 0) {
    extension = '.cjs'
  } else if (!extension.startsWith('.')) {
    extension = `.${extension}`
  }
  return _getLoaders().get(extension)
}

exports.registerLoader = function registerLoader(arg) {
  if (isArray(arg)) {
    for (const item of arg) {
      registerLoader(item)
    }
    return
  }

  let extension = arg.extension
  if (typeof extension !== 'string' || extension.length === 0) {
    throw new Error('Invalid extension')
  }
  if (!extension.startsWith('.')) {
    extension = `.${extension}`
  }
  let loader = arg.loader
  if (typeof loader === 'string') {
    loader = exports.loaders[loader]
    if (typeof loader !== 'object') {
      throw new Error(`Unknown loader "${loader}"`)
    }
  }
  if (typeof loader !== 'object') {
    throw new Error(`Loader must be an object but is ${typeof loader}`)
  }
  if (loader && !loader.format) {
    throw new Error('loader format property must be specified')
  }
  const loaders = _getLoaders()
  if (arg.extensionless && !loaders.has(extension)) {
    _extensionlessLoaders.push(extension)
  }
  loaders.set(extension, loader)

  if (_registered) {
    _registerCommonjsLoader(extension, loader)
  }
}

exports.resolveEs6Module = function resolveEs6Module(id, sourcefile) {
  id = pathNameFromUrl(id) || id

  if (typeof id === 'object' && id !== null) {
    id = `${id}`
  }

  sourcefile = pathNameFromUrl(sourcefile)

  const builtin = _builtinModules.get(id)
  if (builtin !== undefined) {
    return builtin
  }

  if (!sourcefile) {
    sourcefile = pathResolve('index.js')
  }

  const resolveDir = pathDirname(sourcefile)
  const isAbsolute = id.startsWith('/') || pathIsAbsolute(id)

  _getLoaders()

  let result
  let cacheKey
  if (isAbsolute) {
    cacheKey = id
    result = _resolveCache.get(id)
  } else {
    cacheKey = `${resolveDir};${id}`
    result = _resolveCache.get(cacheKey) || _resolveCache.get(id)
  }

  if (result !== undefined) {
    return result
  }

  if (isAbsolute) {
    const cachedModule = require.cache[id]
    if (cachedModule) {
      try {
        result = pathToFileURL(id).href || undefined
      } catch (_) {
        // Ignore error
      }
    }
  }

  if (result === undefined) {
    result = _esbuildBuildResolve(cacheKey, id, resolveDir)
  }

  _resolveCache.set(cacheKey, result)
  return result
}

exports.resolveEs6Module.clearCache = () => {
  _resolveCache.clear()
}

function _registerCommonjsLoader(extension, loader) {
  if (!loader) {
    return
  }

  if (loader.transformCommonJS) {
    Module._extensions[extension] = (mod, filename) => {
      const compile = mod._compile
      mod._compile = function _compile(code) {
        mod._compile = compile
        const newCode = loader.transformCommonJS(code, filename)
        return mod._compile(newCode, filename)
      }
      mod.loaded = true
    }
  } else if (loader.loadCommonJS) {
    Module._extensions[extension] = (mod, filename) => {
      const modExports = loader.loadCommonJS(mod, filename)
      mod.loaded = true
      if (modExports !== undefined && mod.exports !== modExports) {
        mod.exports = modExports
      }
    }
  }
}

function _esrunTranspileCjsSync(input, pathName, parser) {
  const output = _getEsBuild().transformSync(_cleanupText(input), {
    charset: 'utf8',
    sourcefile: pathName,
    format: 'cjs',
    legalComments: 'none',
    loader: parser,
    target: _nodeTargetVersion,
    sourcemap: 'external',
    sourcesContent: false
  })
  return { source: output.code, map: output.map }
}

async function _esrunTranspileModuleAsync(input, pathName, parser) {
  const output = await _getEsBuild().transform(_cleanupText(input), {
    charset: 'utf8',
    sourcefile: pathName,
    format: 'esm',
    legalComments: 'none',
    loader: parser,
    target: _nodeTargetVersion,
    sourcemap: 'external',
    sourcesContent: false,
    define: {
      __filename: JSONstringify(pathName),
      __dirname: JSONstringify(pathDirname(pathName))
    }
  })
  return { source: output.code, map: output.map }
}

async function _tryResolveFile(pathName) {
  let r
  try {
    r = await fs.promises.stat(pathName)
  } catch (_) {}

  if (r) {
    if (r.isFile()) {
      return pathName
    }
    if (r.isDirectory()) {
      pathName = pathJoin(pathName, 'index')
    }
  }

  const pext = pathExtname(pathName)
  if (pext && exports.getLoader(pext) !== undefined) {
    return undefined
  }

  for (const ext of _extensionlessLoaders) {
    const resolved = await _tryResolveFile(pathName + ext)
    if (resolved) {
      return resolved
    }
  }

  return undefined
}

async function _esbuildBuildResolve(cacheKey, id, resolveDir) {
  let path

  if (id.startsWith('./') || id.startsWith('/')) {
    path = await _tryResolveFile(pathResolve(resolveDir, id))
  }
  if (!path) {
    let loaded
    await _getEsBuild().build({
      write: false,
      bundle: true,
      sourcemap: false,
      charset: 'utf8',
      platform: 'node',
      target: _nodeTargetVersion,
      format: 'esm',
      logLevel: 'silent',
      stdin: { contents: `import ${JSONstringify(id)}`, loader: 'ts', resolveDir },
      plugins: [
        {
          name: '-',
          setup(build) {
            build.onLoad(_allFilesFilter, (x) => {
              loaded = x
              return _emptyContents
            })
          }
        }
      ]
    })
    path = loaded && loaded.path
  }

  if (!path) {
    path = null
  } else if (path.indexOf('::') < 0) {
    path = pathToFileURL(path, pathToFileURL(resolveDir)).href
  }

  _resolveCache.set(cacheKey, path)

  return path
}

function _cleanupText(text) {
  if (typeof text !== 'string') {
    if (isBuffer(text) && ((text[0] === 0xfe && text[1] === 0xff) || (text[0] === 0xff && text[1] === 0xfe))) {
      text = text.toString('utf8', 2)
    } else {
      text = text.toString()
    }
  } else if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  return text
}

for (const m of Module.builtinModules) {
  const solved = `node:${m}`
  _builtinModules.set(m, solved)
  _builtinModules.set(solved, solved)
}

exports.pathNameToUrl = function pathNameToUrl(file) {
  if (!file) {
    return undefined
  }
  if (typeof file === 'object') {
    file = `${file}`
  }
  if (file.indexOf('://') < 0) {
    try {
      return pathToFileURL(file).href
    } catch (_) {}
  }
  return file
}

function pathNameFromUrl(url) {
  if (!url) {
    return undefined
  }
  if (url.startsWith('node:')) {
    return undefined
  }
  if (url.indexOf('://') < 0) {
    const indexOfQuestionMark = url.indexOf('?')
    return indexOfQuestionMark > 0 ? url.slice(0, indexOfQuestionMark - 1) : url
  }
  if (url.startsWith('file://')) {
    try {
      return fileURLToPath(url)
    } catch (_) {}
  }
  return undefined
}

exports.pathNameFromUrl = pathNameFromUrl

/** Node does ot pass a default implementation of importModuleDynamically in vm script functions. Fix this behavior */
function _fixVm() {
  const { compileFunction, runInContext, runInNewContext, runInThisContext, Script: VmScript } = vm

  const _fixVmOptions = (options) => {
    if (typeof options === 'string') {
      options = {
        filename: options
      }
    }
    if (typeof options === 'object' && options !== null && !options.importModuleDynamically) {
      const filename = options.filename
      if (filename) {
        options = {
          ...options,
          async importModuleDynamically(url) {
            return import(await exports.resolveEs6Module(url, filename))
          }
        }
      }
    }
    return options
  }

  if (!VmScript.__esrun__) {
    vm.Script = _fixVmScript(VmScript)

    vm.runInContext = (code, contextifiedObject, options) =>
      runInContext(code, contextifiedObject, _fixVmOptions(options))

    vm.runInNewContext = (code, contextObject, options) => runInNewContext(code, contextObject, _fixVmOptions(options))

    vm.runInThisContext = (code, options) => runInThisContext(code, _fixVmOptions(options))

    vm.compileFunction = (code, params, options) => compileFunction(code, params, _fixVmOptions(options))
  }

  function _fixVmScript() {
    function Script(code, options) {
      return new VmScript(code, _fixVmOptions(options))
    }

    Script.__esrun__ = true
    Script.prototype = VmScript.prototype
    VmScript.prototype.constructor = Script
    Object.setPrototypeOf(Script, VmScript)
    return Script
  }
}

const _parseStackTraceRegex =
  /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i

const _convertStackToFileUrl = (stack) => {
  if (isArray(stack)) {
    const state = { nextPosition: null, curPosition: null }
    for (let i = 0; i < stack.length; ++i) {
      const entry = _getSourceMapSupport().wrapCallSite(stack[i], state)
      if (entry) {
        const file = exports.pathNameToUrl(
          entry.getFileName() || entry.getScriptNameOrSourceURL() || (entry.isEval() && entry.getEvalOrigin())
        )
        if (file) {
          return file
        }
      }
    }
  } else if (typeof stack === 'string') {
    stack = stack.split('\n')
    for (let i = 0; i < stack.length; ++i) {
      const parts = _parseStackTraceRegex.exec(stack[i])
      const file = parts && exports.pathNameToUrl(parts[2])
      if (file) {
        return file
      }
    }
  }
  return undefined
}

/**
 * Gets the file url of the caller
 * @param {Function} [caller] The caller function.
 * @returns
 */
exports.getCallerFileUrl = function getCallerFileUrl(caller) {
  const oldStackTraceLimit = _Error.stackTraceLimit
  const oldPrepare = _Error.prepareStackTrace
  try {
    const e = {}
    _Error.stackTraceLimit = 3
    _Error.prepareStackTrace = (_, clallSites) => clallSites
    captureStackTrace(e, typeof caller === 'function' ? caller : exports.getCallerFileUrl)
    const stack = e.stack
    return (stack && _convertStackToFileUrl(stack)) || undefined
  } catch (_) {
    // Ignore error
  } finally {
    _Error.prepareStackTrace = oldPrepare
    _Error.stackTraceLimit = oldStackTraceLimit
  }
  return undefined
}

exports.getCallerFilePath = function getCallerFilePath(caller) {
  return exports.pathNameFromUrl(
    exports.getCallerFileUrl(typeof caller === 'function' ? caller : exports.getCallerFilePath)
  )
}
