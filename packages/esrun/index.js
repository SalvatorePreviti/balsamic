'use strict'

const Module = require('module')
const child_process = require('child_process')
const { dirname: pathDirname, resolve: pathResolve, sep: pathSep, extname: pathExtname } = require('path')
const { existsSync: fsExistsSync } = require('fs')
const { fileURLToPath, pathToFileURL } = require('url')
const { emitUncaughtError } = require('./errors')
const fastGlob = require('fast-glob')
const esbuildPluginExternalModules = require('./esbuild-plugins/external-modules')

const { register: registerSourceMapSupport, setFileSourceMap, getCallerFileUrl } = require('./source-maps')

const { defineProperty } = Reflect

const CHILD_PROCESS_RUNNER_KEY = '$Hr75q0d656ajR'

const nodeTargetVersion = `node${process.version.slice(1)}`

const _nodeModulesDir = `${pathSep}node_modules${pathSep}`

/** @type {import('esbuild')} */
let _esbuild

/** @returns {import('esbuild')} */
exports.getEsBuild = () => _esbuild || (_esbuild = require('esbuild'))

/**
 * Shared esbuild options
 * @type {import('esbuild').TransformOptions}
 */
exports.esTransformOptions = {
  banner: '"use strict";',
  format: 'cjs',
  target: nodeTargetVersion,
  minifyWhitespace: false,
  charset: 'utf8',
  sourcemap: 'external'
}

/**
 * Shared esbuild options
 * @type {import('esbuild').BuildOptions}
 */
exports.esBuildOptions = {
  ...exports.esTransformOptions,
  write: false,
  bundle: true,
  banner: { js: '"use strict";' },
  external: ['*.node', '*.json'],
  platform: 'node',
  plugins: [esbuildPluginExternalModules()],
  watch: false,
  define: {
    require: '__esrun_esrun_require',
    __filename: '__esrun_get_caller_file_path',
    __dirname: '__esrun_get_caller_dir_path',
    'import.meta.url': '__esrun_get_caller_file_url'
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

const _esrun_file_path_getters_registered = false

function _initSyntethicImportMeta(srcPath) {
  defineProperty(global, '__esrun_entry_point_file', {
    value: srcPath,
    configurable: true,
    enumerable: false,
    writable: true
  })

  if (!_esrun_file_path_getters_registered) {
    const __esrun_get_caller_file_url = () =>
      getCallerFileUrl(__esrun_get_caller_file_url) || pathToFileURL(global.__esrun_entry_point_file)

    const __esrun_get_caller_file_path = () => {
      const url = getCallerFileUrl(__esrun_get_caller_file_path)
      return url ? fileURLToPath(url) : global.__esrun_entry_point_file
    }

    const __esrun_get_caller_dir_path = () => {
      const url = getCallerFileUrl(__esrun_get_caller_dir_path)
      return pathDirname(url ? fileURLToPath(url) : global.__esrun_entry_point_file)
    }

    const requireMap = new Map()
    const __get_esrun_esrun_require = () => {
      const callerUrl = getCallerFileUrl(__get_esrun_esrun_require)
      const callerFilename = callerUrl ? fileURLToPath(callerUrl) : global.__esrun_entry_point_file
      let rq = requireMap.get(callerFilename)
      if (!rq && !requireMap.has(callerFilename)) {
        rq = Module.createRequire(callerFilename)
        requireMap.set(callerFilename, rq)
      }
      return rq
    }

    const __set_esrun_esrun_require = (value) => {
      const url = getCallerFileUrl(__set_esrun_esrun_require)
      if (url) {
        const callerFilename = fileURLToPath(url)
        requireMap.set(callerFilename, value)
      }
    }

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

    defineProperty(global, '__esrun_esrun_require', {
      get: __get_esrun_esrun_require,
      set: __set_esrun_esrun_require,
      configurable: true,
      enumerable: false
    })
  }
}

const getMainEntries = async ({ includes, main, resolveDir = process.cwd() }) => {
  // eslint-disable-next-line node/no-deprecated-api
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', ...Object.keys(require.extensions)])
  allowedExtensions.delete('.json')

  const exclusions = includes.filter((include) => include.startsWith('!'))

  const includeFiles = []

  const getFile = (entry) => {
    entry = pathResolve(resolveDir, entry)
    const ext = pathExtname(entry)
    if (!allowedExtensions.has(ext)) {
      for (const extension of allowedExtensions) {
        const nEntry = entry + extension
        if (fsExistsSync(nEntry)) {
          return nEntry
        }
      }
    }
    return entry
  }

  for (const include of includes) {
    if (include.startsWith('!')) {
      continue
    }
    if ((include.startsWith('.') || include.startsWith('/')) && include.indexOf('*') < 0 && include.indexOf('?') < 0) {
      includeFiles.push(getFile(include))
    } else {
      includeFiles.push(
        fastGlob([include, ...exclusions], { absolute: true, cwd: resolveDir, onlyFiles: true, dot: true }).then(
          (items) => items.filter((x) => allowedExtensions.has(pathExtname(x)))
        )
      )
    }
  }

  const set = new Set((await Promise.all(includeFiles)).flat(1))

  const mainFile = getFile(main)
  set.delete(mainFile)

  return { includes: Array.from(set), main: mainFile }
}

const createLoadMainPlugin = (includes, main) => {
  return {
    name: 'esrun-main-loader',
    /** @param {import('esbuild').PluginBuild} build */
    setup(build) {
      build.onResolve({ filter: /__esrun_main__$/ }, ({ path }) => ({ path, external: false }))

      build.onLoad({ filter: /__esrun_main__$/ }, async ({ path }) => {
        const resolveDir = pathDirname(path)
        const entries = await getMainEntries({ includes, main, resolveDir })
        let contents = ''
        for (const entry of entries.includes) {
          contents += `import ${JSON.stringify(entry)};\n`
        }
        contents += `\nimport ${JSON.stringify(entries.main)};\n`
        return {
          contents,
          loader: 'ts',
          resolveDir,
          watchFiles: [...entries.includes, entries.main]
        }
      })
    }
  }
}

/** @type {{[key:string]:{loader: import('esbuild').Loader, highPriority?: boolean}}} */
const _loaders = {
  '.ts': { loader: 'ts', highPriority: true },
  '.tsx': { loader: 'tsx', highPriority: true },
  '.jsx': { loader: 'jsx', highPriority: true },
  '.css': { loader: 'css', highPriority: false },
  '.txt': { loader: 'text', highPriority: false }
}

function makeTransformer(ext, original) {
  const esbuildTransform = (m, filename) => {
    if (filename.indexOf(_nodeModulesDir) < 0) {
      const oldCompile = m._originalCompile || m._compile
      m._originalCompile = oldCompile
      m._compile = function esbuild_compile(source, sourcefile) {
        const opts = {
          ...exports.esTransformOptions,
          loader: (_loaders[ext] && _loaders[ext].loader) || '.js'
        }

        const result = exports.getEsBuild().transformSync(source, opts)

        if (exports.sourceMapSupport && opts.sourcemap) {
          setFileSourceMap(sourcefile, sourcefile, result.map)
        }
        return this._originalCompile(result.code, sourcefile)
      }
    }
    return original(m, filename)
  }
  esbuildTransform._original = original
  return esbuildTransform
}

let _registered = false

function register() {
  if (!_registered) {
    // eslint-disable-next-line node/no-deprecated-api
    const exts = require.extensions || Module._extensions
    const oldExts = { ...exts }
    for (const key in oldExts) {
      delete exts[key]
    }

    const registerTransformer = (ext) => {
      let original = oldExts[ext] || oldExts['.js']
      original = original && (original._original || original)
      exts[ext] = makeTransformer(ext, original)
    }

    for (const ext in _loaders) {
      if (_loaders[ext] && _loaders[ext].highPriority) {
        registerTransformer(ext)
      }
    }
    for (const ext in oldExts) {
      if (!exts[ext] || !exts[ext]._original) {
        exts[ext] = oldExts[ext]
      }
    }
    for (const ext in _loaders) {
      if (!exts[ext] && _loaders[ext]) {
        registerTransformer(ext)
      }
    }

    registerSourceMapSupport()

    _registered = true
  }
}

exports.register = register

/**
 * Build and runs a module in the current node instance.
 * Use esrunChild if you need to watch for changes.
 *
 * @param {{entry: string, resolveDir?: string}} options
 */
exports.esrun = async ({ includes, main, resolveDir = process.cwd() }) => {
  const baseOptions = exports.esBuildOptions

  const buildResult = await exports.getEsBuild().build({
    ...baseOptions,
    metafile: true,
    entryPoints: [pathResolve(resolveDir, '__esrun_main__')],
    outdir: resolveDir,
    plugins: [...(baseOptions.plugins || []), createLoadMainPlugin(includes, main)],
    watch: false
  })

  _execModules(buildResult.outputFiles)
}

/**
 * Build and runs a module in a child process.
 * Allows watching if watch is true.
 *
 * @param {{entry: string, watch?: boolean, resolveDir?: string, args?: string[]}} options
 */
exports.esrunChild = async ({ includes, main, watch, resolveDir = process.cwd(), args }) => {
  let _esRunChildKillTimer = null
  let _esRunChildKillCount = 0
  let _esRunChildProcess = null

  const baseOptions = exports.esBuildOptions
  let _buildResult = await exports.getEsBuild().build({
    ...baseOptions,
    outdir: resolveDir,
    entryPoints: [pathResolve(resolveDir, '__esrun_main__')],
    plugins: [...(baseOptions.plugins || []), createLoadMainPlugin(includes, main)],
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
    stop: () => _buildResult.stop(),
    rebuild: () => _buildResult.rebuild()
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

    newChild.send(buildResult.outputFiles.map((item) => ({ path: item.path, contents: item.contents })))

    const handleMessage = (data) => newChild.send(data)

    process.on('message', handleMessage)

    newChild.on('exit', (code) => {
      process.off('message', handleMessage)
      if (_esRunChildProcess === newChild) {
        _esRunChildProcess = null
      }
      if (watch) {
        if (code) {
          console.log('[esrun] child exited with code', code)
        } else {
          console.log('[esrun] child exited')
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

function _execModules(files) {
  register()

  const sourceFiles = []
  for (const file of files) {
    if (typeof file.path === 'string' && file.path.endsWith('.map')) {
      const srcPath = file.path.slice(0, file.path.length - 4)
      setFileSourceMap(srcPath, srcPath, file.text || Buffer.from(file.contents).toString('utf8'))
    } else {
      sourceFiles.push(file)
    }
  }

  const modules = []
  for (const file of sourceFiles) {
    const srcPath = file.path

    process.argv[1] = srcPath
    _initSyntethicImportMeta(srcPath)

    const m = new Module(srcPath)

    process.mainModule = m
    require.main = m

    m.filename = srcPath
    m.paths = Module._nodeModulePaths(pathDirname(srcPath))

    require.cache[m.id] = m

    modules.push({ m, file })
  }

  for (const { m, file } of modules) {
    m._compile(file.text || Buffer.from(file.contents).toString('utf8'), m.filename)
    m.loaded = true
  }
}

exports.esrunMain = () => {
  const argv = process.argv

  let watch = false
  const includes = []
  let i = 2
  for (; i < argv.length; ++i) {
    if (argv[i] === '-r') {
      const include = argv[i + 1]
      if (!include) {
        break
      }
      includes.push(include)
      ++i
    } else if (argv[i] === '--watch') {
      watch = true
    } else if (argv[i] === '--no-watch') {
      watch = false
    } else {
      break
    }
  }
  argv.splice(2, i - 2)

  const main = argv[2]
  if (!main || main === '--help' || main === '--version') {
    const pkg = require('./package.json')
    if (main !== '--version') {
      console.info()
    }
    console.info(`${pkg.name} v${pkg.version}, esbuild v${this.getEsBuild().version}\n`)
    if (main !== '--version') {
      const messages = [
        'Usage: esrun [--watch] [-r <file|glob-pattern>] <file to run> [arguments]',
        '  --watch                : Executes in watch mode, restarting every time a file changes.',
        '  -r <file|glob-pattern> : Adds a file or a glob pattern to require.',
        '  -r !<glob-pattern>     : Exclude a set of patterns from globbing.'
      ]
      console.error(messages.join('\n'), '\n')
      process.exitCode = 1
    }
    return
  }

  if (watch) {
    exports.esrunChild({ includes, main, watch: true, args: argv.slice(2) }).catch(emitUncaughtError)
  } else {
    exports.esrun({ includes, main }).catch(emitUncaughtError)
  }
}

if (module === require.main) {
  const argv = process.argv
  if (argv[2] === CHILD_PROCESS_RUNNER_KEY) {
    argv.splice(2, 1)
    if (require.main === module) {
      process.once('message', (data) => {
        _execModules(data)
      })
    }
  } else {
    exports.esrunMain()
  }
}
