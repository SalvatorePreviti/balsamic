import chalk from 'chalk'
import util from 'util'
import path from 'path'

export const INSPECT_DEPTH = Math.max(8, util.inspect.defaultOptions.depth || 0)

export const DEV_ICON_ERROR = '❌'

export const DEV_ICON_WARNING = '⚠️ '

export const DEV_ICO_INFO = 'ℹ️ '

export const devColorWarning = chalk.rgb(200, 200, 50)

export const devColorRedOrange = chalk.rgb(255, 150, 50)

export function devLogException(...args) {
  devLogError(...args)
}

export function devLogError(...args) {
  console.error(chalk.redBright(`${DEV_ICON_ERROR} ${chalk.underline('ERROR')}: ${devInspectForLogging(...args)}`))
}

export function devLogWarning(...args) {
  console.warn(
    devColorWarning(
      `${chalk.yellowBright(`${DEV_ICON_WARNING}  ${chalk.underline('WARNING')}:`)} ${devInspectForLogging(...args)}`
    )
  )
}

export function devLogInfo(...args) {
  console.info(
    chalk.cyan(`${chalk.cyanBright(`${DEV_ICO_INFO} ${chalk.underline('INFO')}:`)} ${devInspectForLogging(...args)}`)
  )
}

export function devRunMain(main) {
  const _unhandledError = (error) => {
    devLogException(devColorRedOrange('Unhandled'), error)
    if (!process.exitCode) {
      process.exitCode = 1
    }
    console.log()
    return undefined
  }
  try {
    devInitErrorHandling()
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

export function devGetError(error, caller) {
  if (!(error instanceof Error)) {
    error = new Error(error)
    Error.captureStackTrace(error, typeof caller === 'function' ? caller : devGetError)
  }
  if (error.watchFiles) {
    // Hide this from console logging because is not helpful and noisy
    Reflect.defineProperty(error, 'watchFiles', {
      value: error.watchFiles,
      configurable: true,
      enumerable: false,
      writable: true
    })
  }
  if ('codeFrame' in error) {
    Reflect.defineProperty(error, 'codeFrame', {
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
  depth: INSPECT_DEPTH
}

export function devInspect(what) {
  return what instanceof Error && what.showStack === false ? `${what}` : util.inspect(what, _devInspectOptions)
}

export function devInspectForLogging(...args) {
  return args.map((what) => (typeof what === 'string' ? what : devInspect(what))).join(' ')
}

let _devProcessStartTime

export function devInitErrorHandling() {
  if (_devProcessStartTime) {
    return false
  }
  _devProcessStartTime = process.hrtime()

  if (Error.stackTraceLimit < 10) {
    Error.stackTraceLimit = 10
  }

  if (!util.inspect.defaultOptions.depth || util.inspect.defaultOptions.depth < INSPECT_DEPTH) {
    util.inspect.defaultOptions.depth = INSPECT_DEPTH
  }

  process.on('unhandledRejection', (error) => {
    devLogWarning(devColorRedOrange('Unhandled rejection'), error)
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

export function devPrintOutputFileWritten(outputFilePath, content) {
  outputFilePath = path.resolve(outputFilePath)
  console.log(
    `${chalk.greenBright('💾 file')} ${chalk.rgb(200, 255, 240)(makePathRelative(outputFilePath))} ${chalk.greenBright(
      'written'
    )}  ${chalk.rgb(80, 200, 100)(prettySize(content))}`
  )
}

/** Gets a size in bytes in an human readable form. */
export function prettySize(bytes, options) {
  if (bytes === null || bytes === undefined) {
    bytes = 0
  }
  const appendBytes = !options || options.appendBytes === undefined || options.appendBytes
  if (typeof bytes === 'object' || typeof bytes === 'string') {
    bytes = utf8ByteLength(bytes)
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

export function makePathRelative(filePath, cwd) {
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

export function utf8ByteLength(b) {
  if (b === null || b === undefined) {
    return 0
  }
  if (typeof b === 'number') {
    return b || 0
  }
  return typeof b === 'string' ? Buffer.byteLength(b, 'utf8') : b.length
}

export function bufferToUtf8(b) {
  if (typeof b === 'string') {
    return b
  }
  if (Buffer.isBuffer(b)) {
    return b.toString('utf8')
  }
  return Buffer.from(b).toString('utf8')
}
