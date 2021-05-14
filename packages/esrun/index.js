'use strict'

const Module = require('module')
const child_process = require('child_process')
const { dirname: pathDirname, resolve: pathResolve, sep: pathSep, extname: pathExtname } = require('path')
const { existsSync: fsExistsSync } = require('fs')
const { pathToFileURL, fileURLToPath } = require('url')
const sourceMapSupport = require('source-map-support')
const fastGlob = require('fast-glob')

const { isArray } = Array
const { captureStackTrace } = Error
const { defineProperty } = Reflect

const CHILD_PROCESS_RUNNER_KEY = '$Hr75q0d656ajR'

const nodeTargetVersion = `node${process.version.slice(1)}`

/** @type {import('esbuild')} */
let _esbuild

/** @returns {import('esbuild')} */
exports.getEsBuild = () => _esbuild || (_esbuild = require('esbuild'))

exports.handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1
  }
  console.error('Uncaught', error && error.showStack === false ? `${error}` : error)
}

exports.emitUncaughtError = (error) => {
  try {
    if (process.listenerCount('uncaughtException') === 0) {
      process.once('uncaughtException', exports.handleUncaughtError)
    }
    process.emit('uncaughtException', error)
  } catch (emitError) {
    console.error(emitError)
    try {
      exports.handleUncaughtError(error)
    } catch (_) {}
  }
}

const _parseStackTraceRegex =
  /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i

const _convertStackToFileUrl = (stack) => {
  if (isArray(stack)) {
    const state = { nextPosition: null, curPosition: null }
    for (let i = 0; i < stack.length; ++i) {
      const entry = sourceMapSupport.wrapCallSite(stack[i], state)
      if (entry) {
        const file = _fileToFileUrl(
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
      const file = parts && _fileToFileUrl(parts[2])
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
const getCallerFileUrl = (caller = getCallerFileUrl) => {
  const oldStackTraceLimit = Error.stackTraceLimit
  const oldPrepare = Error.prepareStackTrace
  let stack
  try {
    const e = {}
    Error.stackTraceLimit = 3
    Error.prepareStackTrace = (_, clallSites) => clallSites
    captureStackTrace(e, caller)
    stack = e.stack
    return stack && _convertStackToFileUrl(stack)
  } catch (_) {
    // Ignore error
  } finally {
    Error.prepareStackTrace = oldPrepare
    Error.stackTraceLimit = oldStackTraceLimit
  }
  return undefined
}

exports.getCallerFileUrl = getCallerFileUrl

const esbuildPluginExternalModules = {
  name: 'esrun_external_modules',

  /** @param {import('esbuild').PluginBuild} build */
  setup(build) {
    const requireByDirCache = new Map()
    const nodeModulesDir = `${pathSep}node_modules${pathSep}`

    build.onResolve({ namespace: 'file', filter: /^file:\/\// }, ({ path, resolveDir }) => {
      const filePath = pathResolve(resolveDir, fileURLToPath(path))
      return { path: filePath, external: filePath.includes(nodeModulesDir) }
    })

    // On every module resolved, we check if the module name should be an external
    build.onResolve({ namespace: 'file', filter: /^[a-zA-Z@_]/ }, ({ path, resolveDir }) => {
      const split = path.split('/', 3)
      let id = split[0]
      if (!id || id.includes('://')) {
        return null
      }

      if (path.startsWith('@')) {
        id = `${split[0]}/${split[1]}`
      }

      try {
        const key = pathResolve(resolveDir, 'index.js')

        let moduleRequire = requireByDirCache.get(key)
        if (moduleRequire === undefined) {
          moduleRequire = Module.createRequire(key).resolve
          requireByDirCache.set(key, moduleRequire)
        }

        const resolved = moduleRequire(`${id}/package.json`)
        if (resolved.includes(nodeModulesDir)) {
          return { path, external: true }
        }
      } catch (_) {}
      return null
    })
  }
}

exports.esbuildPluginExternalModules = esbuildPluginExternalModules

/**
 * Shared esbuild options
 * @type {import('esbuild').BuildOptions}
 */
exports.esBuildOptions = {
  write: false,
  banner: { js: '"use strict";' },
  bundle: true,
  format: 'cjs',
  minifyWhitespace: true,
  sourcemap: 'external',
  target: nodeTargetVersion,
  plugins: [esbuildPluginExternalModules],
  platform: 'node',
  watch: false,
  define: {
    'import.meta.url': '__esrun_get_caller_file_url',
    __filename: '__esrun_get_caller_file_path',
    __dirname: '__esrun_get_caller_dir_path'
  }
}

/**
 * Resolves a module using esbuild module resolution
 *
 * @param {string} id Module to resolve
 * @param {string} [resolveDir] The directory to resolve from
 * @returns {Promise<string>} The resolved module
 */
exports.esbuildResolve = async (id, resolveDir = process.cwd()) => {
  if (!id) {
    return id || './'
  }
  let _resolve
  const resolvedPromise = new Promise((resolve) => (_resolve = resolve))
  return Promise.race([
    resolvedPromise,
    exports
      .getEsBuild()
      .build({
        ...exports.esBuildOptions,
        sourcemap: false,
        logLevel: 'silent',
        stdin: { contents: `import ${JSON.stringify(id)}`, loader: 'ts', resolveDir, sourcefile: __filename },
        plugins: [
          {
            name: 'resolve-main',
            setup(build) {
              build.onLoad({ filter: /.*/ }, ({ path }) => {
                id = path
                _resolve(id)
                return { contents: '' }
              })
            }
          }
        ]
      })
      .then(() => id)
  ])
}

function _fileToFileUrl(file) {
  if (typeof file !== 'string') {
    return ''
  }
  if (file.indexOf('://') < 0) {
    try {
      return pathToFileURL(file).href
    } catch (_) {}
  }
  return file
}

const _esrun_file_path_getters_registered = false

function _initSyntethicImportMeta(srcPath) {
  defineProperty(global, '__esrun_entry_point_file_url', {
    value: _fileToFileUrl(srcPath),
    configurable: true,
    enumerable: false,
    writable: true
  })

  if (!_esrun_file_path_getters_registered) {
    const __esrun_get_caller_file_url = () =>
      getCallerFileUrl(__esrun_get_caller_file_url) || global.__esrun_entry_point_file_url

    const __esrun_get_caller_file_path = () => fileURLToPath(getCallerFileUrl(__esrun_get_caller_file_path))

    const __esrun_get_caller_dir_path = () => pathDirname(fileURLToPath(getCallerFileUrl(__esrun_get_caller_dir_path)))

    defineProperty(global, '__esrun_get_caller_file_url', {
      get: __esrun_get_caller_file_url,
      configurable: true,
      enumerable: false
    })

    defineProperty(global, '__esrun_get_caller_file_path', {
      get: __esrun_get_caller_file_path,
      configurable: true,
      enumerable: false
    })

    defineProperty(global, '__esrun_get_caller_dir_path', {
      get: __esrun_get_caller_dir_path,
      configurable: true,
      enumerable: false
    })
  }
}

/**
 * Gets the files to load
 * @param {string | string[]} entries List of files or patterns to load
 * @param {string} [resolveDir] The directory from where relative files should be resolved.
 * @returns {string[]} List of files to load.
 */
const getMainEntries = async (entries, resolveDir = process.cwd()) => {
  // eslint-disable-next-line node/no-deprecated-api
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', ...Object.keys(require.extensions)])
  allowedExtensions.delete('.json')

  if (!isArray(entries)) {
    entries = entries.split(';')
  }

  const exclusions = []
  for (const entry of entries) {
    if (entry.startsWith('!')) {
      exclusions.push(entry)
    }
  }

  const list = []
  for (let entry of entries) {
    if (entry.startsWith('!')) {
      continue
    }
    if ((entry.startsWith('.') || entry.startsWith('/')) && entry.indexOf('*') < 0 && entry.indexOf('?') < 0) {
      entry = pathResolve(entry)
      const ext = pathExtname(entry)
      if (!allowedExtensions.has(ext)) {
        for (const extension of allowedExtensions) {
          const nEntry = entry + extension
          if (fsExistsSync(nEntry)) {
            entry = nEntry
            break
          }
        }
      }
      list.push(entry)
    } else {
      list.push(
        fastGlob([entry, ...exclusions], { absolute: true, cwd: resolveDir, onlyFiles: true, dot: true }).then(
          (items) => items.filter((x) => allowedExtensions.has(pathExtname(x)))
        )
      )
    }
  }

  return Array.from(new Set((await Promise.all(list)).flat(1)))
}

exports.getMainEntries = getMainEntries

const createLoadMainPlugin = (entries) => {
  const pluginName = 'esrun-main-loader'
  return {
    name: pluginName,
    /** @param {import('esbuild').PluginBuild} build */
    setup(build) {
      build.onResolve({ filter: /__esrun_main__$/ }, ({ path }) => ({ path, external: false, pluginName }))
      build.onLoad({ filter: /__esrun_main__$/ }, async ({ path }) => {
        const resolveDir = pathDirname(path)
        const inputFiles = await exports.getMainEntries(entries, resolveDir)
        let contents = ''
        for (const entry of inputFiles) {
          contents += `import ${JSON.stringify(entry)};\n`
        }
        return { contents, loader: 'ts', resolveDir, watchFiles: inputFiles, pluginName }
      })
    }
  }
}

/**
 * Build and runs a module in the current node instance.
 * Use esrunChild if you need to watch for changes.
 *
 * @param {{entry: string, resolveDir?: string}} options
 */
exports.esrun = async ({ entries, resolveDir = process.cwd() }) => {
  const baseOptions = exports.esBuildOptions
  const buildResult = await exports.getEsBuild().build({
    ...baseOptions,
    entryPoints: [pathResolve(resolveDir, '__esrun_main__')],
    outdir: resolveDir,
    plugins: [...(baseOptions.plugins || []), createLoadMainPlugin(entries)],
    watch: false
  })

  return _execModules(buildResult.outputFiles)
}

/**
 * Build and runs a module in a child process.
 * Allows watching if watch is true.
 *
 * @param {{entry: string, watch?: boolean, resolveDir?: string, args?: string[]}} options
 */
exports.esrunChild = async ({ entries, watch, resolveDir = process.cwd(), args }) => {
  let _esRunChildKillTimer
  let _esRunChildKillCount = 0
  let _esRunChildProcess

  const baseOptions = exports.esBuildOptions
  let _buildResult = await exports.getEsBuild().build({
    ...baseOptions,
    outdir: resolveDir,
    entryPoints: [pathResolve(resolveDir, '__esrun_main__')],
    plugins: [...(baseOptions.plugins || []), createLoadMainPlugin(entries)],
    watch: watch
      ? {
          onRebuild(_error, rebuildResult) {
            _buildResult = rebuildResult
            _esRunWatch_runChild()
          }
        }
      : false
  })

  _esRunWatch_runChild()

  return {
    get outputFiles() {
      return _buildResult.outputFiles
    },
    get errors() {
      return _buildResult.errors
    },
    get warnings() {
      return _buildResult.warnings
    },
    get metaFile() {
      return _buildResult.metafile
    },
    stop() {
      return _buildResult.stop()
    },
    rebuild() {
      return _buildResult.rebuild()
    }
  }

  function _esRunWatch_newChild(buildResult) {
    const newChild = child_process.fork(
      __filename,
      args ? [CHILD_PROCESS_RUNNER_KEY, ...args] : [CHILD_PROCESS_RUNNER_KEY],
      {
        serialization: 'advanced',
        env: process.env,
        stdio: 'inherit'
      }
    )

    _esRunChildProcess = newChild

    newChild.on('error', (error) => console.error(error))

    newChild.send(buildResult.outputFiles.map((item) => ({ url: item.url, path: item.path, text: item.text })))

    const handleMessage = (data) => newChild.send(data)

    process.on('message', handleMessage)

    newChild.on('exit', (code) => {
      process.off('message', handleMessage)
      if (_esRunChildProcess === newChild) {
        _esRunChildProcess = null
      }
      if (watch) {
        if (code) {
          console.log('[watch] child exited with code', code)
        } else {
          console.log('[watch] child exited')
        }
      }
    })
  }

  function _esRunWatch_runChild() {
    if (_esRunChildKillTimer) {
      clearTimeout(_esRunChildKillTimer)
      _esRunChildKillTimer = null
    }

    if (_esRunChildProcess) {
      if (_esRunChildKillCount === 0 || _esRunChildKillCount > 5) {
        _esRunChildProcess.kill(_esRunChildKillCount > 5 ? 'SIGKILL' : 'SIGTERM')
      }
      _esRunChildKillTimer = setTimeout(_esRunWatch_runChild, 10 + _esRunChildKillCount * 100)
      return
    }

    _esRunChildKillCount = 0
    _esRunWatch_newChild(_buildResult)
  }
}

function _execModules(outputFiles) {
  const sourceMapsLookup = new Map()
  const sourceFiles = []
  for (const outputFile of outputFiles) {
    if (typeof outputFile.path === 'string' && outputFile.path.endsWith('.map')) {
      sourceMapsLookup.set(outputFile.path.slice(0, outputFile.path.length - 4), outputFile)
    } else {
      sourceFiles.push(outputFile)
    }
  }

  sourceMapSupport.install({
    hookRequire: true,
    retrieveSourceMap: (source) => {
      const input = sourceMapsLookup.get(source)
      return input ? { url: input.path, map: input.text } : null
    }
  })

  const modules = []
  for (const sourceFile of sourceFiles) {
    const srcPath = sourceFile.path

    process.argv[1] = srcPath
    _initSyntethicImportMeta(srcPath)

    const m = new Module(srcPath)

    process.mainModule = m
    require.main = m

    m.filename = srcPath
    m.paths = Module._nodeModulePaths(pathDirname(srcPath))

    require.cache[m.id] = m

    modules.push({ m, sourceFile })
  }

  for (const { m, sourceFile } of modules) {
    m._compile(sourceFile.text, m.filename)
    m.loaded = true
  }
}

exports.esrunMain = () => {
  const argv = process.argv

  let watch = false
  if (argv[2] === '--watch') {
    watch = true
    argv.splice(2, 1)
  }

  const entries = argv[2]
  if (!entries || entries === '--help' || entries === '--version') {
    const pkg = require('./package.json')
    if (entries !== '--version') {
      console.info()
    }
    console.info(`${pkg.name} v${pkg.version}, esbuild v${this.getEsBuild().version}\n`)
    if (entries !== '--version') {
      console.error("Usage: esrun [--watch] '<path/to/file/to/run;anoter/file/to/run;folder-to-run/**/*>'\n")
      process.exitCode = 1
    }
    return
  }

  if (watch) {
    exports.esrunChild({ entries, watch: true, args: argv.slice(2) }).catch(exports.emitUncaughtError)
  } else {
    exports.esrun({ entries }).catch(exports.emitUncaughtError)
  }
}

if (module === require.main) {
  const argv = process.argv
  if (argv[2] === CHILD_PROCESS_RUNNER_KEY) {
    argv.splice(2, 1)
    if (require.main === module) {
      process.once('message', _execModules)
    }
  } else {
    exports.esrunMain()
  }
}
