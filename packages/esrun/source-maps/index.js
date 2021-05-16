const sourceMapSupport = require('source-map-support')
const { pathToFileURL } = require('url')

const _Error = Error
const { captureStackTrace } = _Error

const { isArray } = Array

let _sourceMapSupportRegistered = false
const _sourceMapCache = new Map()

const _parseStackTraceRegex =
  /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i

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
exports.getCallerFileUrl = (caller = exports.getCallerFileUrl) => {
  const oldStackTraceLimit = _Error.stackTraceLimit
  const oldPrepare = _Error.prepareStackTrace
  let stack
  try {
    const e = {}
    _Error.stackTraceLimit = 3
    _Error.prepareStackTrace = (_, clallSites) => clallSites
    captureStackTrace(e, caller)
    stack = e.stack
    return stack && _convertStackToFileUrl(stack)
  } catch (_) {
    // Ignore error
  } finally {
    _Error.prepareStackTrace = oldPrepare
    _Error.stackTraceLimit = oldStackTraceLimit
  }
  return undefined
}

exports.register = () => {
  if (_sourceMapSupportRegistered) {
    return false
  }
  _sourceMapSupportRegistered = true
  sourceMapSupport.install({
    environment: 'node',
    handleUncaughtExceptions: true,
    hookRequire: true,
    retrieveSourceMap: (source) => _sourceMapCache.get(source)
  })
  return true
}

exports.setFileSourceMap = (compiledUrl, originalUrl, map) => {
  _sourceMapCache.set(compiledUrl, { originalUrl, map })
}

exports.deleteFileSourceMap = (compiledUrl) => {
  _sourceMapCache.delete(compiledUrl)
}

exports.getFileSourceMap = (url) => _sourceMapCache.get(url)
