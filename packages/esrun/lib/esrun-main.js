'use strict'

const path = require('path')

const { Module } = require('module')

const handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1
  }
  console.error('Uncaught', error && error.showStack === false ? `${error}` : error)
}

exports.childProcessFilename = __filename

exports.handleUncaughtError = handleUncaughtError

const emitUncaughtError = (error) => {
  try {
    if (process.listenerCount('uncaughtException') === 0) {
      process.once('uncaughtException', handleUncaughtError)
    }
    process.emit('uncaughtException', error)
  } catch (emitError) {
    console.error(emitError)
    try {
      handleUncaughtError(error)
    } catch (_) {}
  }
}

exports.emitUncaughtError = emitUncaughtError

exports.execModule = ({ entry, srcPath, src, mapPath, map }) => {
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
  m.paths = Module._nodeModulePaths(path.dirname(srcPath))
  m._compile(src, srcPath)
  m.loaded = true
}

if (require.main === module) {
  process.once('message', exports.execModule)
}
