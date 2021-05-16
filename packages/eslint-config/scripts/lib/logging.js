/* eslint-disable no-console */

const chalk = require('chalk')
const manifest = require('../../package.json')

const _formatArg = (arg) => {
  if (arg instanceof Error && arg.showStack === false) {
    const name = arg.name || 'Error'
    return name && name !== 'Error'
      ? `${chalk.yellowBright.underline(name)}: ${chalk.yellow(arg.message)}`
      : chalk.yellow(arg.message)
  }
  return arg
}

exports.log = console.log.bind(console)

exports.banner = (...args) => {
  console.log()
  exports.info(`${manifest.name} v${manifest.version}`, ...args)
  console.log()
}

exports.footer = (...args) => {
  console.log()
  exports.info(...args)
  console.log()
}

exports.error = (...args) => {
  console.error(chalk.redBright(`${chalk.underline('ERROR')}:`), ...args.map(_formatArg))
}

exports.warn = (...args) => {
  console.warn(chalk.yellowBright(`${chalk.underline('WARN')}:`), ...args.map(_formatArg))
}

exports.info = (...args) => {
  console.info(chalk.blueBright(`${chalk.underline('INFO')}:`), ...args.map(_formatArg))
}

exports.skip = (...args) => {
  console.info(
    chalk.yellow('-'),
    ...args.map((x) => {
      const s = _formatArg(x)
      return typeof s === 'string' ? chalk.yellow(s) : s
    })
  )
}

exports.progress = (...args) => {
  console.info(
    chalk.cyanBright('+'),
    ...args.map((x) => {
      const s = _formatArg(x)
      return typeof s === 'string' ? chalk.cyan(s) : s
    })
  )
}

exports.handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1
  }
  console.error()
  exports.error(error)
  console.error()
}
