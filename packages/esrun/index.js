'use strict'

const Module = require('module')
const child_process = require('child_process')
const { dirname: pathDirname, resolve: pathResolve } = require('path')
const fs = require('fs')

const CHILD_PROCESS_RUNNER_KEY = '$Hr75q0d656ajRZHL5UGP'

const nodeTargetVersion = `node${process.version.slice(1)}`

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

const esbuildPluginExternalModules = {
  name: 'esrun_external_modules',
  setup(build) {
    // On every module resolved, we check if the module name should be an external
    build.onResolve({ namespace: 'file', filter: /.*/ }, ({ path, resolveDir }) => {
      if (path.startsWith('.') || path.startsWith('/')) {
        return null
      }

      const split = path.split('/', 3)
      let id = split[0]
      if (!id || id.includes(':')) {
        return null
      }
      if (path.startsWith('@')) {
        id = `${split[0]}/${split[1]}`
      }

      try {
        const resolved = Module.createRequire(pathResolve(resolveDir, 'index.js')).resolve(`${id}/package.json`)
        if (resolved.includes('node_modules')) {
          return { path, external: true }
        }
      } catch (_) {}

      return null
    })
  }
}

exports.nodeExternalsPlugin = esbuildPluginExternalModules

/**
 * Shared esbuild options
 * @type {import('esbuild').BuildOptions}
 */
exports.esBuildOptions = {
  write: false,
  bundle: true,
  minifyWhitespace: true,
  sourcemap: 'external',
  target: nodeTargetVersion,
  plugins: [esbuildPluginExternalModules],
  platform: 'node',
  format: 'cjs',
  watch: false
}

/**
 * Resolves a module using esbuild module resolution
 *
 * @param {string} id Module to resolve
 * @param {string} [resolveDir] The directory to resolve from
 * @returns {string} The resolved module
 */
exports.esbuildResolve = async (id, resolveDir = process.cwd()) => {
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
        stdin: {
          contents: `import ${JSON.stringify(id)}`,
          loader: 'js',
          resolveDir,
          sourcefile: __filename
        },
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

/**
 * Build and runs a module in the current node instance.
 * Use esrunChild if you need to watch for changes.
 *
 * @param {{entry: string}} options
 */
exports.esrun = async ({ entry }) => {
  const srcPath = await exports.esbuildResolve(entry)
  const srcDir = pathDirname(srcPath)

  const buildResult = await exports.getEsBuild().build({
    ...exports.esBuildOptions,
    entryPoints: [srcPath],
    outdir: srcDir,
    watch: false
  })

  return execModule(inputFromBuildResult(entry, srcPath, buildResult))
}

/**
 * Build and runs a module in a child process.
 * Allows watching if watch is true.
 *
 * @param {{entry: string, watch?: boolean}} options
 */
exports.esrunChild = async ({ entry, watch, args }) => {
  const srcPath = await exports.esbuildResolve(entry)
  const srcDir = pathDirname(srcPath)

  let _esRunChildKillTimer
  let _esRunChildKillCount = 0
  let _esRunChildProcess
  let _esRunChildInput

  const buildResult = await exports.getEsBuild().build({
    ...exports.esBuildOptions,
    entryPoints: [srcPath],
    outdir: srcDir,
    watch: watch
      ? {
          onRebuild(_error, rebuildResult) {
            if (rebuildResult) {
              _esRunChildInput = inputFromBuildResult(entry, srcPath, buildResult)
              _esRunWatch_runChild()
            }
          }
        }
      : false
  })

  _esRunChildInput = inputFromBuildResult(entry, srcPath, buildResult)
  _esRunWatch_runChild()

  return {
    stop() {
      return buildResult.stop()
    },
    rebuild() {
      return buildResult.rebuild()
    }
  }

  function _esRunWatch_newChild(input) {
    const newChild = child_process.fork(__filename, [CHILD_PROCESS_RUNNER_KEY, ...args], {
      serialization: 'advanced',
      env: process.env,
      stdio: 'inherit'
    })

    _esRunChildProcess = newChild

    newChild.on('error', (error) => console.error(error))

    newChild.send(input)

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
    _esRunWatch_newChild(_esRunChildInput)
  }
}

function execModule({ entry, srcPath, src, mapPath, map }) {
  process.argv[1] = entry || srcPath

  const sourceMapSupport = require('source-map-support')

  sourceMapSupport.install({
    hookRequire: true,
    retrieveSourceMap: (source) => (source === srcPath ? { url: mapPath, map } : null)
  })

  const m = new Module(srcPath)

  process.mainModule = m
  require.main = m

  m.filename = srcPath
  m.paths = Module._nodeModulePaths(pathDirname(srcPath))
  m._compile(src, srcPath)
  m.loaded = true
}

function inputFromBuildResult(entry, srcPath, { outputFiles }) {
  return {
    entry,
    srcPath,
    src: outputFiles[1].text,
    mapPath: outputFiles[0].path,
    map: outputFiles[0].text
  }
}

exports.esrunMain = () => {
  const argv = process.argv

  let watch = false
  if (argv[2] === '--watch') {
    watch = true
    argv.splice(2, 1)
  }

  let entry = argv[2]
  if (!entry || entry === '--help' || entry === '--version') {
    const pkg = require('./package.json')
    if (entry !== '--version') {
      console.info()
    }
    console.info(`${pkg.name} v${pkg.version}, esbuild v${this.getEsBuild().version}\n`)
    if (entry !== '--version') {
      console.error('Usage: esrun [--watch] <path/to/file/to/run>\n')
      process.exitCode = 1
    }
    return
  }

  if (!entry.startsWith('.') && !entry.startsWith('/')) {
    if (fs.existsSync(entry)) {
      entry = `./${entry}`
    } else if (fs.existsSync(`${entry}.ts`)) {
      entry = `./${entry}.ts`
    } else if (fs.existsSync(`${entry}.js`)) {
      entry = `./${entry}.js`
    }
  }
  if (watch) {
    exports.esrunChild({ entry, watch: true, args: argv.slice(2) }).catch(exports.emitUncaughtError)
  } else {
    exports.esrun({ entry }).catch(exports.emitUncaughtError)
  }
}

if (module === require.main) {
  const argv = process.argv
  if (argv[2] === CHILD_PROCESS_RUNNER_KEY) {
    argv.splice(2, 1)
    if (require.main === module) {
      process.once('message', execModule)
    }
  } else {
    exports.esrunMain()
  }
}
