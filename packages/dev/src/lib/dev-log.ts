import type { Awaited } from './types'
import util from 'util'
import term from 'chalk'
import { initialCwd, makePathRelative, millisecondsToString, startMeasureTime } from './utils'
import { fileURLToPath } from 'url'
import { devError } from './dev-error'
import readline from 'readline'

export { term }

let _logProcessTimeInitialized = false
const _errorLoggedSet = new WeakSet<any>()
let _processTitle: string | undefined
let _defaultProcessTitle: string | undefined

export const getProcessTitle = () => {
  if (_processTitle === undefined) {
    return _defaultProcessTitle !== undefined
      ? _defaultProcessTitle
      : (_defaultProcessTitle = _extrapolateProcessTitle(process.mainModule || process.argv[1]) || 'script')
  }
  return _processTitle
}

getProcessTitle.hasProcessTitle = () => !!_processTitle

export const setProcessTitle = (value: string | { filename?: string; id?: string; path?: string }) => {
  _processTitle = _extrapolateProcessTitle(value)
}

export function devLog(...args: unknown[]): void {
  devLog.log(...args)
}

devLog.inspectOptions = {
  ...util.inspect.defaultOptions,
  colors: !!term.supportsColor && term.supportsColor.hasBasic,
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

devLog.logColor = (color: TermBasicColor, ...args: unknown[]): void => {
  console.log(term[color](_devInspectForLogging(args)))
}

devLog.error = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.error()
  } else {
    console.error(term.redBright(`❌ ${term.underline('ERROR')}: ${_devInspectForLogging(args)}`))
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
  const processTitle = getProcessTitle()
  if (processTitle) {
    devLog.log(`${term.blueBright('\n▌>')} ${term.rgb(100, 200, 255)(processTitle)}\n`)
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
    term.blueBright(`${term.underline('DEV')}: `) +
      term.blueBright(_devInspectForLogging(args)) +
      (devLine ? `\n     ${term.blueBright(devLine)}` : '')
  )
}

devLog.warn = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.warn()
  } else {
    console.warn(
      term.rgb(200, 200, 50)(`${term.yellowBright(`⚠️  ${term.underline('WARNING')}:`)} ${_devInspectForLogging(args)}`)
    )
  }
}

devLog.info = (...args: unknown[]): void => {
  if (args.length === 0) {
    console.info()
  } else {
    console.info(term.cyan(`${term.cyanBright(`ℹ️  ${term.underline('INFO')}:`)} ${_devInspectForLogging(args)}`))
  }
}

function _extrapolateProcessTitle(
  value: string | { filename?: string; id?: string; path?: string } | null | undefined
) {
  if (typeof value === 'object' && value !== null) {
    let fname = value.filename
    if (typeof fname !== 'string' || !fname) {
      fname = value.path
      if (typeof fname !== 'string' || !fname) {
        fname = value.id
      }
    }
    if (fname) {
      value = fname
    }
  }
  if (typeof value !== 'string' || !value || value === '.' || value === './') {
    return undefined
  }
  if (/^file:\/\//i.test(value)) {
    value = fileURLToPath(value)
  }
  if (value.startsWith('/')) {
    value = makePathRelative(value, initialCwd) || value
  }
  return value
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
        term.redBright(
          `\n😡 ${getProcessTitle()} ${term.redBright.bold.underline('FAILED')} in ${elapsed}. exitCode: ${exitCode}\n`
        )
      )
    } else {
      devLog.log(term.greenBright(`\n✅ ${getProcessTitle()} ${term.bold('OK')} ${term.green(`in ${elapsed}`)}\n`))
    }
  }
  process.once('exit', handleExit)
  return true
}

export interface DevLogTimeOptions {
  printStarted?: boolean
  logError?: boolean
  timed?: boolean
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
  const isTimed = options.timed === undefined || !!options.timed
  if (isTimed && (options.printStarted === undefined || options.printStarted)) {
    devLog.log(term.cyan(`${term.cyan('◆')} ${title}`) + term.gray(' started...'))
  }
  const elapsed = startMeasureTime()
  try {
    if (typeof fnOrPromise === 'function') {
      fnOrPromise = fnOrPromise()
    }
    const result = await fnOrPromise
    if (isTimed) {
      devLog.log(
        term.green(`\n${term.green('✔')} ${title} ${term.bold('OK')} ${term.gray(`in ${elapsed.toString()}`)}`)
      )
    }
    return result
  } catch (error) {
    if (isTimed || options.logError) {
      if (options.logError && (typeof error !== 'object' || error === null || !_errorLoggedSet.has(error))) {
        devLog.error(`${title} FAILED in ${elapsed.toString()}`, error)
      } else {
        devLog.error(term.redBright(`${title} ${term.bold('FAILED')} in ${elapsed.toString()}`))
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
    const question = `${term.greenBright('?')} ${term.whiteBright(message)} ${term.gray(
      defaultValue ? '(Y/n)' : '(N/y)'
    )} `
    rl.question(question, (answer) => {
      rl.close()
      answer = (answer || '').trim()
      const confirm = /^[yY]/.test(answer || (defaultValue ? 'Y' : 'N'))
      console.log(confirm ? term.greenBright('  Yes') : term.redBright('  No'))
      console.log()
      resolve(confirm)
    })
  })
}

function _devInspectForLogging(args: unknown[]) {
  return args.map((what) => (typeof what === 'string' ? what : devLog.inspect(what))).join(' ')
}
