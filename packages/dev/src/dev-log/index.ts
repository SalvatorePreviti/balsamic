import util from 'util'
import readline from 'readline'
import { colors } from '../colors'
import { millisecondsToString, startMeasureTime } from '../lib/utils'
import { devEnv } from '../dev-env'
import { devError } from '../dev-error'
import type { Awaited } from '../types'

let _logProcessTimeInitialized = false
const _errorLoggedSet = new WeakSet<any>()

export function devLog(...args: unknown[]): void {
  devLog.log(...args)
}

devLog.inspectOptions = {
  ...util.inspect.defaultOptions,
  colors: !!colors.supportsColor && colors.supportsColor.hasBasic,
  depth: Math.max(8, util.inspect.defaultOptions.depth || 0)
}

devLog.log = (...args: unknown[]): void => {
  console.log(_devInspectForLogging(args))
}

export type TermBasicColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'blackBright'
  | 'redBright'
  | 'greenBright'
  | 'yellowBright'
  | 'blueBright'
  | 'magentaBright'
  | 'cyanBright'
  | 'whiteBright'

devLog.logBlack = (...args: unknown[]) => devLog.log(colors.black(_devInspectForLogging(args)))
devLog.logRed = (...args: unknown[]) => devLog.log(colors.red(_devInspectForLogging(args)))
devLog.logGreen = (...args: unknown[]) => devLog.log(colors.green(_devInspectForLogging(args)))
devLog.logYellow = (...args: unknown[]) => devLog.log(colors.yellow(_devInspectForLogging(args)))
devLog.logBlue = (...args: unknown[]) => devLog.log(colors.blue(_devInspectForLogging(args)))
devLog.logMagenta = (...args: unknown[]) => devLog.log(colors.magenta(_devInspectForLogging(args)))
devLog.logCyan = (...args: unknown[]) => devLog.log(colors.cyan(_devInspectForLogging(args)))
devLog.logWhite = (...args: unknown[]) => devLog.log(colors.white(_devInspectForLogging(args)))
devLog.logBlackBright = (...args: unknown[]) => devLog.log(colors.blackBright(_devInspectForLogging(args)))
devLog.logRedBright = (...args: unknown[]) => devLog.log(colors.redBright(_devInspectForLogging(args)))
devLog.logGreenBright = (...args: unknown[]) => devLog.log(colors.greenBright(_devInspectForLogging(args)))
devLog.logYellowBright = (...args: unknown[]) => devLog.log(colors.yellowBright(_devInspectForLogging(args)))
devLog.logBlueBright = (...args: unknown[]) => devLog.log(colors.blueBright(_devInspectForLogging(args)))
devLog.logMagentaBright = (...args: unknown[]) => devLog.log(colors.magentaBright(_devInspectForLogging(args)))
devLog.logCyanBright = (...args: unknown[]) => devLog.log(colors.cyanBright(_devInspectForLogging(args)))
devLog.logWhiteBright = (...args: unknown[]) => devLog.log(colors.whiteBright(_devInspectForLogging(args)))

devLog.logColor = (color: TermBasicColor, ...args: unknown[]) => devLog.log(colors[color](_devInspectForLogging(args)))

devLog.error = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.error()
  } else {
    console.error(colors.redBright(`❌ ${colors.underline('ERROR')}: ${_devInspectForLogging(args)}`))
  }
}

function errorOnce<TError>(error: TError): TError extends Error ? TError : Error
function errorOnce<TError>(message: string, error: TError, caller?: Function): TError extends Error ? TError : Error
function errorOnce(message?: any, error?: any, caller?: any) {
  if (!error) {
    error = message
  }
  const err = devError(error, typeof caller === 'function' ? caller : devLog.errorOnce)
  if (typeof error === 'object' && error !== null && _errorLoggedSet.has(error)) {
    return err
  }
  if (!_errorLoggedSet.has(err)) {
    _errorLoggedSet.add(err)
    if (typeof error === 'object' && error !== null && err !== error) {
      _errorLoggedSet.add(error)
    }
    devLog.error(err)
  }
  return err
}

devLog.printProcessBanner = function printProcessBanner() {
  const processTitle = devEnv.getProcessTitle()
  if (processTitle) {
    devLog.log(`${colors.blueBright('\n⬢')} ${colors.rgb(100, 200, 255)(processTitle)}\n`)
  }
}

devLog.errorOnce = errorOnce

/** Developer debug log. Appends the line where this function was called. */
devLog.dev = (...args: unknown[]): void => {
  const oldStackTraceLimit = Error.stackTraceLimit
  const err: { stack?: string } = {}
  Error.stackTraceLimit = 1
  try {
    Error.captureStackTrace(err, devLog.dev)
  } finally {
    Error.stackTraceLimit = oldStackTraceLimit
  }
  let devLine = ''
  for (const line of (err.stack || '')?.split('\n')) {
    if (line.startsWith('    at')) {
      devLine = line.trim()
      break
    }
  }
  devLog.log(
    colors.blueBright(`${colors.underline('DEV')}: `) +
      colors.blueBright(_devInspectForLogging(args)) +
      (devLine ? `\n     ${colors.blueBright(devLine)}` : '')
  )
}

devLog.warn = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.warn()
  } else {
    console.warn(
      colors.rgb(
        200,
        200,
        50
      )(`${colors.yellowBright(`⚠️  ${colors.underline('WARNING')}:`)} ${_devInspectForLogging(args)}`)
    )
  }
}

devLog.info = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.info()
  } else {
    console.info(colors.cyan(`${colors.cyanBright(`ℹ️  ${colors.underline('INFO')}:`)} ${_devInspectForLogging(args)}`))
  }
}

devLog.inspect = (what: unknown): string => {
  if (what instanceof Error) {
    if (what.showStack === false) {
      return `${what}`
    }
    what = devError(what, devLog.inspect)
  }
  return util.inspect(what, devLog.inspectOptions)
}

/** Attach an handler that will log process duration when the process terminates. */
devLog.initProcessTime = () => {
  if (_logProcessTimeInitialized) {
    return false
  }
  _logProcessTimeInitialized = true
  const handleExit = () => {
    const elapsed = millisecondsToString(process.uptime() * 1000)
    const exitCode = process.exitCode
    if (exitCode) {
      devLog.log(
        colors.redBright(
          `\n😡 ${devEnv.getProcessTitle()} ${colors.redBright.bold.underline(
            'FAILED'
          )} in ${elapsed}. exitCode: ${exitCode}\n`
        )
      )
    } else {
      devLog.log(
        colors.greenBright(`\n✅ ${devEnv.getProcessTitle()} ${colors.bold('OK')} ${colors.green(`in ${elapsed}`)}\n`)
      )
    }
  }
  process.once('exit', handleExit)
  return true
}

export interface DevLogTimeOptions {
  printStarted?: boolean
  logError?: boolean
  showStack?: boolean
  timed?: boolean
  indent?: number | string
}

/** Prints how much time it takes to run something */
async function timed<T>(
  title: string,
  fnOrPromise: (() => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimeOptions
): Promise<Awaited<T>>

/** Prints how much time it takes to run something */
async function timed<T>(
  title: string,
  fnOrPromise: null | undefined | (() => Promise<T> | T) | Promise<T> | T,
  options?: DevLogTimeOptions
): Promise<null | undefined | T>

async function timed(title: unknown, fnOrPromise: unknown, options: DevLogTimeOptions = {}) {
  if (fnOrPromise === null || (typeof fnOrPromise !== 'object' && typeof fnOrPromise !== 'function')) {
    return fnOrPromise
  }
  if (typeof fnOrPromise === 'object' && typeof (fnOrPromise as any).then !== 'function') {
    return fnOrPromise
  }
  if (!title && typeof fnOrPromise === 'function') {
    title = fnOrPromise.name
  }
  const indent = _parseIndent(options.indent)
  const isTimed = options.timed === undefined || !!options.timed
  const printStarted = options.printStarted === undefined || !!options.printStarted
  if (isTimed && printStarted) {
    devLog.log(colors.cyan(`${indent}${colors.cyan('◆')} ${title}`) + colors.gray(' started...'))
  }
  const elapsed = startMeasureTime()
  try {
    if (typeof fnOrPromise === 'function') {
      fnOrPromise = fnOrPromise()
    }
    const result = await fnOrPromise
    if (isTimed) {
      devLog.log(
        colors.green(
          `${printStarted ? '\n' : ''}${indent}${colors.green('✔')} ${title} ${colors.bold('OK')} ${colors.gray(
            `in ${elapsed.toString()}`
          )}`
        )
      )
    }
    return result
  } catch (error) {
    if (isTimed || options.logError) {
      if (options.logError && (typeof error !== 'object' || error === null || !_errorLoggedSet.has(error))) {
        devLog.error(`${title} FAILED in ${elapsed.toString()}`, options.showStack !== false ? error : `${error}`)
      } else {
        devLog.error(colors.redBright(`${title} ${colors.bold('FAILED')} in ${elapsed.toString()}`))
      }
    }
    throw error
  }
}

devLog.timed = timed

/** Asks the user to input Yes or No */
devLog.askConfirmation = async function askConfirmation(message: string, defaultValue: boolean) {
  if (!process.stdin || !process.stdout || !process.stdout.isTTY) {
    return true
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface(process.stdin, process.stdout)
    const question = `${colors.greenBright('?')} ${colors.whiteBright(message)} ${colors.gray(
      defaultValue ? '(Y/n)' : '(N/y)'
    )} `
    rl.question(question, (answer) => {
      rl.close()
      answer = (answer || '').trim()
      const confirm = /^[yY]/.test(answer || (defaultValue ? 'Y' : 'N'))
      console.log(confirm ? colors.greenBright('  Yes') : colors.redBright('  No'))
      console.log()
      resolve(confirm)
    })
  })
}

function _devInspectForLogging(args: unknown[]) {
  return args.map((what) => (typeof what === 'string' ? what : devLog.inspect(what))).join(' ')
}

function _parseIndent(value: string | number | undefined | null): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' && value > 0
    ? '  '.repeat((value > 20 ? 20 : value) | 0)
    : ''
}
