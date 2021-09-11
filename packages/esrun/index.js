'use strict'

const os = require('os')
const vm = require('vm')
const crypto = require('crypto')
const { pathToFileURL } = require('url')
const dev = require('./dev.js')
const Module = require('module')
const {
  dirname: pathDirname,
  resolve: pathResolve,
  join: pathJoin,
  extname: pathExtname,
  isAbsolute: pathIsAbsolute
} = require('path')
const fs = require('fs')

const { isArray } = Array
const { isBuffer } = Buffer
const { defineProperty } = Reflect
const { stringify: JSONstringify } = JSON
const { existsSync: fsExistsSync } = fs

const _posixNodeModulesPath = '/node_modules/'

let _registered = false
let _sourceMapSupportRegistered = false

const _mainFields = ['source', 'module', 'main']

const _resolveCache = new Map()
const _builtinModules = new Map()
const _sourceMaps = new Map()
const _loaders = new Map()
const _extensionlessLoaders = []
const _emptyContents = { contents: '' }
const _allFilesFilter = { filter: /.*/ }
const _nodeTargetVersion = `node${process.version.slice(1)}`

exports.toBoolean = dev.toBoolean

exports.pathNameToUrl = dev.pathNameToUrl

exports.pathNameFromUrl = dev.pathNameFromUrl

Reflect.defineProperty(exports, 'isCI', {
  get: () => dev.getIsCI(),
  set: (value) => {
    dev.setIsCI(value)
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'setIsCI', {
  get: () => dev.setIsCI,
  set: (value) => {
    dev.setIsCI = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'getIsCI', {
  get: () => dev.getIsCI,
  set: (value) => {
    dev.getIsCI = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'isMainModule', {
  get: () => dev.isMainModule,
  set: (value) => {
    dev.isMainModule = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'addMainEntry', {
  get: () => dev.addMainEntry,
  set: (value) => {
    dev.addMainEntry = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'handleUncaughtError', {
  get: () => dev.handleUncaughtError,
  set: (value) => {
    dev.handleUncaughtError = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'emitUncaughtError', {
  get: () => dev.emitUncaughtError,
  set: (value) => {
    dev.emitUncaughtError = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'getCallerFileUrl', {
  get: () => dev.getCallerFileUrl,
  set: (value) => {
    dev.getCallerFileUrl = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'getCallerFilePath', {
  get: () => dev.getCallerFilePath,
  set: (value) => {
    dev.getCallerFilePath = value
  },
  configurable: true,
  enumerable: true
})

defineProperty(exports, 'makePathRelative', {
  get: () => dev.makePathRelative,
  set: (value) => {
    dev.makePathRelative = value
  },
  configurable: true,
  enumerable: true
})

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

  const filenameUrl = pathToFileURL(__filename).href
  _resolveCache.set(__dirname, filenameUrl)
  _resolveCache.set(__filename, filenameUrl)
  _resolveCache.set(filenameUrl, filenameUrl)
  _resolveCache.set('@balsamic/esrun/index.js', filenameUrl)
  _resolveCache.set('@balsamic/esrun/index/', filenameUrl)
  _resolveCache.set('@balsamic/esrun/index', filenameUrl)
  _resolveCache.set('@balsamic/esrun', filenameUrl)

  const devFilenameUrl = pathToFileURL(dev.__filename).href
  _resolveCache.set(dev.__filename, devFilenameUrl)
  _resolveCache.set(devFilenameUrl, devFilenameUrl)
  _resolveCache.set('@balsamic/esrun/dev.js', devFilenameUrl)
  _resolveCache.set('@balsamic/esrun/dev/', devFilenameUrl)
  _resolveCache.set('@balsamic/esrun/dev', devFilenameUrl)

  const resolvedEsrunCjs = pathJoin(__dirname, 'esrun.js')
  _resolveCache.set(resolvedEsrunCjs, pathToFileURL(resolvedEsrunCjs).href)

  exports.registerLoader([
    { extension: '.ts', loader: 'ts', extensionless: true },
    { extension: '.tsx', loader: 'tsx', extensionless: true },
    { extension: '.jsx', loader: 'jsx', extensionless: true },
    { extension: '.mjs', loader: 'mjs', extensionless: true },
    { extension: '.es6', loader: 'mjs' },
    { extension: '.js', loader: 'default', extensionless: true },
    { extension: '.cjs', loader: 'cjs', extensionless: true },
    { extension: '.json', loader: 'json', extensionless: true },
    { extension: '.html', loader: 'text' },
    { extension: '.htm', loader: 'text' },
    { extension: '.txt', loader: 'text' },
    { extension: '.css', loader: 'text' },
    { extension: '.md', loader: 'text' },
    { extension: '.bin', loader: 'buffer' }
  ])

  return _loaders
}

Reflect.defineProperty(exports, '__esModule', { value: true })
Reflect.defineProperty(exports, 'default', { value: exports })

exports.isRegistered = () => _registered

defineProperty(exports.isRegistered, 'valueOf', {
  get: exports.isRegistered,
  configurable: true,
  enumerable: false
})

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
    transformModule: (input) => _esrunTranspileModuleAsync(input, 'ts'),
    transformCommonJS: (input) => _esrunTranspileCjsSync(input, 'ts')
  },
  tsx: {
    format: 'module',
    transformModule: (input) => _esrunTranspileModuleAsync(input, 'tsx'),
    transformCommonJS: (input) => _esrunTranspileCjsSync(input, 'tsx')
  },
  jsx: {
    format: 'module',
    transformModule: (input) => _esrunTranspileModuleAsync(input, 'jsx'),
    transformCommonJS: (input) => _esrunTranspileCjsSync(input, 'jsx')
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

let _evalModuleCounter = 0

const _evalModuleTemp = new Map()

exports._evalModuleTemp = _evalModuleTemp

exports.esrunEval = async function esrunEval(source, { bundle, extension, format, callerUrl, isMain, isStatic } = {}) {
  isMain = !!isMain
  isStatic = isMain || !!isStatic
  if (!callerUrl) {
    callerUrl = dev.getCallerFileUrl(exports.esrunEval) || pathToFileURL(pathResolve('index.js')).href
  }
  console.log(callerUrl)
  bundle = !!bundle
  if (!extension) {
    extension = '.tsx'
  }
  if (!format) {
    format = 'module'
  }

  const resolveDir = pathDirname(dev.pathNameFromUrl(callerUrl) || pathResolve('index.js'))

  let filename
  if (isStatic) {
    filename = `$esrun-eval-${crypto.createHash('sha256').update(source).digest().toString('hex')}${extension}`
  } else {
    filename = `$esrun-eval-${_evalModuleCounter++}${extension}`
  }

  const pathName = pathResolve(resolveDir, filename)

  if (isStatic) {
    const found = _evalModuleTemp.get(pathName)
    if (found !== undefined) {
      return found.promise
    }
  }

  const url = pathToFileURL(pathName).href
  const evalModule = { source, format, bundle, extension, url, pathName, callerUrl, resolveDir, isMain, isStatic }
  _evalModuleTemp.set(pathName, evalModule)
  _evalModuleTemp.set(url, evalModule)

  if (isMain) {
    exports.addMainEntry(pathName)
  }

  const promise = import(url)
  evalModule.promise = promise

  if (isStatic) {
    return promise
  }

  try {
    return await promise
  } finally {
    _evalModuleTemp.delete(pathName)
    _evalModuleTemp.delete(url)
    _sourceMaps.delete(pathName)
    _sourceMaps.delete(url)
  }
}

exports.registerSourceMapSupport = function registerSourceMapSupport() {
  if (_sourceMapSupportRegistered) {
    return false
  }

  if (!dev._wrapCallSite) {
    dev._wrapCallSite = (entry, state) => _getSourceMapSupport().wrapCallSite(entry, state)
  }

  _getSourceMapSupport().install({
    environment: 'node',
    handleUncaughtExceptions: false,
    hookRequire: true,
    retrieveFile: (path) => {
      const found = _evalModuleTemp.get(path)
      return found ? found.source : null
    },
    retrieveSourceMap: (source) => _sourceMaps.get(source) || null
  })
  _sourceMapSupportRegistered = true
  return true
}

exports.register = function register() {
  if (_registered || global.__esrun_module) {
    return false
  }

  defineProperty(global, '__esrun_module', {
    value: module,
    configurable: false,
    enumerable: false,
    writable: false
  })

  _loadDotEnv()

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

exports.setFileSourceMap = function setFileSourceMap(url, sourcePath, map) {
  if (!_sourceMapSupportRegistered) {
    exports.registerSourceMapSupport()
  }

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

exports.resolveEsModule = function resolveEsModule(id, sourcefile) {
  id = dev.pathNameFromUrl(id) || id

  if (typeof id === 'object' && id !== null) {
    id = `${id}`
  }

  const evalModule = _evalModuleTemp.get(id)
  if (evalModule !== undefined) {
    return evalModule.url || id
  }

  const sourceEvalModule = _evalModuleTemp.get(sourcefile)
  if (sourceEvalModule) {
    sourcefile = sourceEvalModule.callerUrl
  }

  sourcefile = dev.pathNameFromUrl(sourcefile)

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

exports.clearResolveEsModuleCache = () => {
  _resolveCache.clear()
}

function _registerCommonjsLoader(extension, loader) {
  if (!loader) {
    return
  }

  if (loader.transformCommonJS) {
    Module._extensions[extension] = (mod, pathName) => {
      const compile = mod._compile
      mod._compile = function _compile(source) {
        mod._compile = compile
        const newCode = loader.transformCommonJS({ source, pathName })
        return mod._compile(newCode, pathName)
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

function _esrunTranspileCjsSync({ source, pathName }, parser) {
  const output = _getEsBuild().transformSync(_cleanupText(source), {
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

async function _esrunTranspileModuleAsync({ source, pathName, bundle }, parser) {
  const code = _cleanupText(source)

  if (bundle) {
    const bundled = await _getEsBuild().build({
      stdin: { contents: code, loader: parser, sourcefile: pathName, resolveDir: pathDirname(pathName) },
      write: false,
      bundle: true,
      charset: 'utf8',
      format: 'esm',
      legalComments: 'none',
      platform: 'node',
      target: _nodeTargetVersion,
      mainFields: _mainFields,
      resolveExtensions: _extensionlessLoaders,
      sourcemap: 'external',
      outdir: pathDirname(pathName),
      sourcesContent: false,
      plugins: [
        {
          name: 'esrun-bundle',
          setup(build) {
            build.onResolve(_allFilesFilter, async ({ path, resolveDir }) => {
              const resolved = await exports.resolveEsModule(path, pathJoin(resolveDir, 'index.js'))
              const resolvedPath = dev.pathNameFromUrl(resolved)
              if (!resolvedPath) {
                return undefined
              }
              const external =
                resolvedPath === __filename ||
                resolvedPath.indexOf('@balsamic/esrun') > 0 ||
                (!resolvedPath.endsWith('.tsx') &&
                  !resolvedPath.endsWith('.ts') &&
                  !resolvedPath.endsWith('.jsx') &&
                  resolved.indexOf(_posixNodeModulesPath) >= 0)
              return { path: resolvedPath, external }
            })
          }
        }
      ],
      define: {
        __filename: JSONstringify(pathName),
        __dirname: JSONstringify(pathDirname(pathName))
      }
    })

    if (bundled.outputFiles.length === 1) {
      return { source: bundled.outputFiles[0].text }
    }

    return { source: bundled.outputFiles[1].text, map: bundled.outputFiles[0].text }
  }

  const output = await _getEsBuild().transform(code, {
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
      format: 'esm',
      logLevel: 'silent',
      platform: 'node',
      target: _nodeTargetVersion,
      mainFields: _mainFields,
      resolveExtensions: _extensionlessLoaders,
      stdin: { contents: `import ${JSONstringify(id)}`, loader: 'ts', resolveDir },
      plugins: [
        {
          name: 'esrun-resolve',
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
  } else {
    const ext = pathExtname(path)
    if ((ext === '.js' || ext === '.mjs' || ext === '.cjs') && !id.endsWith(ext)) {
      const tsPath = `${path.slice(0, path.length - ext.length)}.ts`
      if (fsExistsSync(tsPath)) {
        path = tsPath
      } else {
        const tsxPath = `${path.slice(0, path.length - ext.length)}.tsx`
        if (fsExistsSync(tsxPath)) {
          path = tsxPath
        }
      }
    }

    if (path.indexOf('::') < 0) {
      path = pathToFileURL(path, pathToFileURL(resolveDir)).href
    }
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
            return import(await exports.resolveEsModule(url, filename))
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

const REGEX_NEWLINE = '\n'
const REGEX_NEWLINES = /\\n/g
const REGEX_NEWLINES_MATCH = /\r\n|\n|\r/
const REGEX_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/

function _loadDotEnv() {
  try {
    if (!dev.toBoolean(process.env.DOTENV_DISABLED)) {
      let dotenvPath = process.env.DOTENV_CONFIG_PATH || pathResolve(process.cwd(), '.env')
      dotenvPath = dotenvPath.startsWith('~')
        ? pathResolve(os.homedir(), dotenvPath.slice(dotenvPath.startsWith('/') || dotenvPath.startsWith('\\') ? 2 : 1))
        : dotenvPath
      for (const line of fs.readFileSync(dotenvPath, 'utf8').split(REGEX_NEWLINES_MATCH)) {
        // matching "KEY' and 'VAL' in 'KEY=VAL'
        const keyValueArr = line.match(REGEX_INI_KEY_VAL)
        // matched?
        if (keyValueArr !== null) {
          const key = keyValueArr[1]
          let val = (keyValueArr[2] || '').trim()
          const singleQuoted = val.startsWith("'") && val.endsWith("'")
          const doubleQuoted = val.startsWith('"') && val.endsWith('"')
          if (singleQuoted || doubleQuoted) {
            val = val.substring(1, val.length - 1)
            if (doubleQuoted) {
              val = val.replace(REGEX_NEWLINES, REGEX_NEWLINE)
            }
          }
          if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
            process.env[key] = val
          }
        }
      }
      return true
    }
  } catch (_e) {
    // Do nothing
  }
  return false
}
