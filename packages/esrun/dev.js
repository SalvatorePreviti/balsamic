'use strict'

const path = require('path')
const util = require('util')
const chalk = require('chalk')
const { pathToFileURL, fileURLToPath } = require('url')

const { defineProperty } = Reflect
const { isArray } = Array
const _Error = Error
const { captureStackTrace } = _Error

const _mainEntries = new Set()

exports.chalk = chalk

defineProperty(exports, '__esModule', { value: true })
defineProperty(exports, 'default', { value: exports })

const _toBooleanFalse = {
  '': false,
  false: false,
  False: false,
  FALSE: false,
  off: false,
  OFF: false,
  Off: false,
  no: false,
  No: false,
  NO: false,
  F: false,
  f: false,
  n: false,
  N: false,
  0: false
}

function toBoolean(value) {
  if (!value) {
    return false
  }
  if (value === true) {
    return true
  }
  if (typeof value === 'number') {
    return !(value === 0)
  }
  if (_toBooleanFalse[value] === false) {
    return false
  }
  if (
    typeof value === 'string' &&
    (value.startsWith(' ') || value.endsWith(' ')) &&
    _toBooleanFalse[value.trim()] === false
  ) {
    return false
  }
  return !!value
}

exports.toBoolean = toBoolean

let _isCI

exports.setIsCI = (value) => {
  value = toBoolean(value)

  if (_isCI !== value) {
    _isCI = value

    if (value) {
      process.env.CI = 'true'
    } else {
      delete process.env.CI
    }
  }

  return value
}

exports.getIsCI = () => (_isCI !== undefined ? _isCI : (_isCI = toBoolean(process.env.CI)))

defineProperty(exports, 'isCI', {
  get: () => exports.getIsCI(),
  set: (value) => {
    exports.setIsCI(value)
  },
  configurable: true,
  enumerable: true
})

exports.INSPECT_DEPTH = Math.max(8, util.inspect.defaultOptions.depth || 0)

exports.DEV_ICON_ERROR = '❌'

exports.DEV_ICON_WARNING = '⚠️ '

exports.DEV_ICO_INFO = 'ℹ️ '

exports.devColorWarning = chalk.rgb(200, 200, 50)

exports.devColorRedOrange = chalk.rgb(255, 150, 50)

exports.devLogException = function devLogException(...args) {
  return exports.devLogError(...args)
}

exports.devLogError = function devLogError(...args) {
  console.error(
    chalk.redBright(`${exports.DEV_ICON_ERROR} ${chalk.underline('ERROR')}: ${exports.devInspectForLogging(...args)}`)
  )
}

exports.devLogWarning = function devLogWarning(...args) {
  console.warn(
    exports.devColorWarning(
      `${chalk.yellowBright(
        `${exports.DEV_ICON_WARNING}  ${chalk.underline('WARNING')}:`
      )} ${exports.devInspectForLogging(...args)}`
    )
  )
}

exports.devLogInfo = function devLogInfo(...args) {
  console.info(
    chalk.cyan(
      `${chalk.cyanBright(`${exports.DEV_ICO_INFO} ${chalk.underline('INFO')}:`)} ${exports.devInspectForLogging(
        ...args
      )}`
    )
  )
}

exports.devRunMain = function devRunMain(main) {
  const _unhandledError = (error) => {
    exports.devLogException(exports.devColorRedOrange('Unhandled'), error)
    if (!process.exitCode) {
      process.exitCode = 1
    }
    console.log()
    return undefined
  }
  try {
    exports.devInitErrorHandling()
    console.log()
    const result = main()
    if (typeof result === 'object' && result !== null) {
      if (typeof result.catch === 'function') {
        return result.catch(_unhandledError)
      } else if (typeof result.then === 'function') {
        return result.then((x) => x, _unhandledError)
      }
    }
    return result
  } catch (error) {
    _unhandledError(error)
  }
  return Promise.resolve(undefined)
}

exports.devGetError = function devGetError(error, caller) {
  if (!(error instanceof Error)) {
    error = new Error(error)
    Error.captureStackTrace(error, typeof caller === 'function' ? caller : devGetError)
  }
  if (error.watchFiles) {
    // Hide this from console logging because is not helpful and noisy
    defineProperty(error, 'watchFiles', {
      value: error.watchFiles,
      configurable: true,
      enumerable: false,
      writable: true
    })
  }
  if ('codeFrame' in error) {
    defineProperty(error, 'codeFrame', {
      value: error.codeFrame,
      configurable: true,
      enumerable: false,
      writable: true
    })
  }
  return error
}

const _devInspectOptions = {
  colors: !!chalk.supportsColor && chalk.supportsColor.hasBasic,
  depth: exports.INSPECT_DEPTH
}

exports.devInspect = function devInspect(what) {
  return what instanceof Error && what.showStack === false ? `${what}` : util.inspect(what, _devInspectOptions)
}

exports.devInspectForLogging = function devInspectForLogging(...args) {
  return args.map((what) => (typeof what === 'string' ? what : exports.devInspect(what))).join(' ')
}

let _devProcessStartTime

exports.devInitErrorHandling = function devInitErrorHandling() {
  if (_devProcessStartTime) {
    return false
  }
  _devProcessStartTime = process.hrtime()

  if (Error.stackTraceLimit < 10) {
    Error.stackTraceLimit = 10
  }

  if (!util.inspect.defaultOptions.depth || util.inspect.defaultOptions.depth < exports.INSPECT_DEPTH) {
    util.inspect.defaultOptions.depth = exports.INSPECT_DEPTH
  }

  process.on('unhandledRejection', (error) => {
    exports.devLogWarning(exports.devColorRedOrange('Unhandled rejection'), error)
  })

  const handleExit = () => {
    const timeDiffiff = process.hrtime(_devProcessStartTime)
    const timeDiffMs = (timeDiffiff[0] * 1e9 + timeDiffiff[1]) * 1e-6
    console.log()
    if (process.exitCode) {
      console.log(chalk.redBright(`😞 Failed in ${timeDiffMs.toFixed(0)} ms. exitCode: ${process.exitCode}\n`))
    } else {
      console.log(chalk.rgb(50, 200, 70)(`✔️  Done in ${timeDiffMs.toFixed(0)} ms\n`))
    }
  }
  process.once('exit', handleExit)
  return true
}

exports.devPrintOutputFileWritten = function devPrintOutputFileWritten(outputFilePath, content) {
  outputFilePath = path.resolve(outputFilePath)
  console.log(
    `${chalk.greenBright('💾 file')} ${chalk.rgb(
      200,
      255,
      240
    )(exports.makePathRelative(outputFilePath))} ${chalk.greenBright('written')}  ${chalk.rgb(
      80,
      200,
      100
    )(exports.prettySize(content))}`
  )
}

/** Gets a size in bytes in an human readable form. */
exports.prettySize = function prettySize(bytes, options) {
  if (bytes === null || bytes === undefined) {
    bytes = 0
  }
  const appendBytes = !options || options.appendBytes === undefined || options.appendBytes
  if (typeof bytes === 'object' || typeof bytes === 'string') {
    bytes = exports.utf8ByteLength(bytes)
  }
  bytes = bytes < 0 ? Math.floor(bytes) : Math.ceil(bytes)
  let s
  if (!isFinite(bytes) || bytes < 1024) {
    s = `${bytes} ${appendBytes ? 'Bytes' : 'B'}`
  } else {
    const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), 6)
    s = `${+(bytes / 1024 ** i).toFixed(2)} ${i ? ' kMGTPE'[i] : ''}`
    if (appendBytes) {
      s += `, ${bytes} Bytes`
    }
  }
  if (options && options.fileType) {
    s = `${options.fileType} ${s}`
  }
  return s
}

exports.makePathRelative = function makePathRelative(filePath, cwd) {
  if (!filePath) {
    return './'
  }
  if (filePath.indexOf('\\') >= 0) {
    return filePath // avoid doing this on windows
  }
  try {
    const relativePath = path.posix.normalize(path.posix.relative(cwd || process.cwd(), filePath))
    return relativePath && relativePath.length < filePath.length ? relativePath : filePath
  } catch (_) {
    return filePath
  }
}

exports.utf8ByteLength = function utf8ByteLength(b) {
  if (b === null || b === undefined) {
    return 0
  }
  if (typeof b === 'number') {
    return b || 0
  }
  return typeof b === 'string' ? Buffer.byteLength(b, 'utf8') : b.length
}

exports.bufferToUtf8 = function bufferToUtf8(b) {
  if (typeof b === 'string') {
    return b
  }
  if (Buffer.isBuffer(b)) {
    return b.toString('utf8')
  }
  return Buffer.from(b).toString('utf8')
}

exports.handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1
  }
  exports.devLogError('Uncaught', error)
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

exports._wrapCallSite = null

const _parseStackTraceRegex =
  /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i

function _convertStackToFileUrl(stack) {
  if (isArray(stack)) {
    const state = { nextPosition: null, curPosition: null }
    for (let i = 0; i < stack.length; ++i) {
      const entry = exports._wrapCallSite ? exports._wrapCallSite(stack[i], state) : stack[i]
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

exports.pathNameFromUrl = function pathNameFromUrl(url) {
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

  if (url.startsWith(path.sep)) {
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

exports.addMainEntry = (pathName) => {
  if (pathName) {
    _mainEntries.add(exports.pathNameFromUrl(pathName) || pathName)
  }
}

exports.__filename = __filename

exports.__dirname = __dirname

const _validIdentifierSpecialsRegex = /[\s!%^&*(){}[\]?~`\-+=:'|/<>,.;"']/g

exports.isValidIdentifier = function isValidIdentifier(name) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 100 ||
    _validIdentifierSpecialsRegex.test(name) ||
    name === '__proto__'
  ) {
    return false
  }
  try {
    // eslint-disable-next-line no-new-func,no-new
    new Function(name, `var ${name}`)
    return true
  } catch (_) {}
  return false
}
