import util from 'util'
import readline from 'readline'
import { colors as _colors } from '../colors'
import { millisecondsToString, startMeasureTime } from '../lib/utils'
import { devEnv } from '../dev-env'
import { devError } from '../dev-error'
import type { Awaited } from '../types'

let _logProcessTimeInitialized = false
const _errorLoggedSet = new WeakSet<any>()

export namespace devLog {
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
}

export function devLog(...args: unknown[]): void {
  devLog.log(...args)
}

devLog.colors = _colors

devLog.inspectOptions = {
  ...util.inspect.defaultOptions,
  colors: !!devLog.colors.supportsColor && devLog.colors.supportsColor.hasBasic,
  depth: Math.max(8, util.inspect.defaultOptions.depth || 0)
}

devLog.log = function log(...args: unknown[]): void {
  console.log(_devInspectForLogging(args))
}

devLog.logBlack = function logBlack(...args: unknown[]) {
  devLog.log(devLog.colors.black(_devInspectForLogging(args)))
}

devLog.logRed = function logRed(...args: unknown[]) {
  devLog.log(devLog.colors.red(_devInspectForLogging(args)))
}

devLog.logGreen = function logGreen(...args: unknown[]) {
  devLog.log(devLog.colors.green(_devInspectForLogging(args)))
}

devLog.logYellow = function logYellow(...args: unknown[]) {
  devLog.log(devLog.colors.yellow(_devInspectForLogging(args)))
}

devLog.logBlue = function logBlue(...args: unknown[]) {
  devLog.log(devLog.colors.blue(_devInspectForLogging(args)))
}

devLog.logMagenta = function logMagenta(...args: unknown[]) {
  devLog.log(devLog.colors.magenta(_devInspectForLogging(args)))
}

devLog.logCyan = function logCyan(...args: unknown[]) {
  devLog.log(devLog.colors.cyan(_devInspectForLogging(args)))
}

devLog.logWhite = function logWhite(...args: unknown[]) {
  devLog.log(devLog.colors.white(_devInspectForLogging(args)))
}

devLog.logBlackBright = function logBlackBright(...args: unknown[]) {
  devLog.log(devLog.colors.blackBright(_devInspectForLogging(args)))
}

devLog.logRedBright = function logRedBright(...args: unknown[]) {
  devLog.log(devLog.colors.redBright(_devInspectForLogging(args)))
}

devLog.logGreenBright = function logGreenBright(...args: unknown[]) {
  devLog.log(devLog.colors.greenBright(_devInspectForLogging(args)))
}

devLog.logYellowBright = function logYellowBright(...args: unknown[]) {
  devLog.log(devLog.colors.yellowBright(_devInspectForLogging(args)))
}

devLog.logBlueBright = function logBlueBright(...args: unknown[]) {
  devLog.log(devLog.colors.blueBright(_devInspectForLogging(args)))
}
devLog.logMagentaBright = function logMagentaBright(...args: unknown[]) {
  devLog.log(devLog.colors.magentaBright(_devInspectForLogging(args)))
}

devLog.logCyanBright = function logCyanBright(...args: unknown[]) {
  devLog.log(devLog.colors.cyanBright(_devInspectForLogging(args)))
}

devLog.logWhiteBright = function logWhiteBright(...args: unknown[]) {
  devLog.log(devLog.colors.whiteBright(_devInspectForLogging(args)))
}

devLog.logColor = function logColor(color: devLog.TermBasicColor, ...args: unknown[]) {
  devLog.log(devLog.colors[color](_devInspectForLogging(args)))
}

devLog.error = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.error()
  } else {
    console.error(devLog.colors.redBright(`❌ ${devLog.colors.underline('ERROR')}: ${_devInspectForLogging(args)}`))
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
    devLog.log(`${devLog.colors.blueBright('\n⬢')} ${devLog.colors.rgb(100, 200, 255)(processTitle)}\n`)
  }
}

devLog.errorOnce = errorOnce

/** Developer debug log. Appends the line where this function was called. */
devLog.dev = function (...args: unknown[]): void {
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
    devLog.colors.blueBright(`${devLog.colors.underline('DEV')}: `) +
      devLog.colors.blueBright(_devInspectForLogging(args)) +
      (devLine ? `\n     ${devLog.colors.blueBright(devLine)}` : '')
  )
}

devLog.warn = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.warn()
  } else {
    console.warn(
      devLog.colors.rgb(
        200,
        200,
        50
      )(`${devLog.colors.yellowBright(`⚠️  ${devLog.colors.underline('WARNING')}:`)} ${_devInspectForLogging(args)}`)
    )
  }
}

devLog.info = function (...args: unknown[]): void {
  if (args.length === 0) {
    console.info()
  } else {
    console.info(
      devLog.colors.cyan(
        `${devLog.colors.cyanBright(`ℹ️  ${devLog.colors.underline('INFO')}:`)} ${_devInspectForLogging(args)}`
      )
    )
  }
}

devLog.inspect = function (what: unknown): string {
  if (what instanceof Error) {
    if (what.showStack === false) {
      return `${what}`
    }
    what = devError(what, devLog.inspect)
  }
  return util.inspect(what, devLog.inspectOptions)
}

/** Attach an handler that will log process duration when the process terminates. */
devLog.initProcessTime = function () {
  if (_logProcessTimeInitialized) {
    return false
  }
  _logProcessTimeInitialized = true
  const handleExit = () => {
    const elapsed = millisecondsToString(process.uptime() * 1000)
    const exitCode = process.exitCode
    if (exitCode) {
      devLog.log(
        devLog.colors.redBright(
          `\n😡 ${devEnv.getProcessTitle()} ${devLog.colors.redBright.bold.underline(
            'FAILED'
          )} in ${elapsed}. exitCode: ${exitCode}\n`
        )
      )
    } else {
      devLog.log(
        devLog.colors.greenBright(
          `\n✅ ${devEnv.getProcessTitle()} ${devLog.colors.bold('OK')} ${devLog.colors.green(`in ${elapsed}`)}\n`
        )
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
    devLog.log(devLog.colors.cyan(`${indent}${devLog.colors.cyan('◆')} ${title}`) + devLog.colors.gray(' started...'))
  }
  const elapsed = startMeasureTime()
  try {
    if (typeof fnOrPromise === 'function') {
      fnOrPromise = fnOrPromise()
    }
    const result = await fnOrPromise
    if (isTimed) {
      devLog.log(
        devLog.colors.green(
          `${printStarted ? '\n' : ''}${indent}${devLog.colors.green('✔')} ${title} ${devLog.colors.bold(
            'OK'
          )} ${devLog.colors.gray(`in ${elapsed.toString()}`)}`
        )
      )
    }
    return result
  } catch (error) {
    if (isTimed || options.logError) {
      if (options.logError && (typeof error !== 'object' || error === null || !_errorLoggedSet.has(error))) {
        devLog.error(`${title} FAILED in ${elapsed.toString()}`, options.showStack !== false ? error : `${error}`)
      } else {
        devLog.error(devLog.colors.redBright(`${title} ${devLog.colors.bold('FAILED')} in ${elapsed.toString()}`))
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
    const question = `${devLog.colors.greenBright('?')} ${devLog.colors.whiteBright(message)} ${devLog.colors.gray(
      defaultValue ? '(Y/n)' : '(N/y)'
    )} `
    rl.question(question, (answer) => {
      rl.close()
      answer = (answer || '').trim()
      const confirm = /^[yY]/.test(answer || (defaultValue ? 'Y' : 'N'))
      console.log(confirm ? devLog.colors.greenBright('  Yes') : devLog.colors.redBright('  No'))
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
