'use strict'

const logging = require('./logging')
const path = require('path')
const { initProject, initClangFormat, initNpmIgnore } = require('./init-project')

exports.handleUncaughtError = logging.handleUncaughtError

process.on('uncaughtException', logging.handleUncaughtError)

exports.main = async function main(argv = process.argv) {
  const argument = argv[2]

  const name = path.basename(process.argv[1], '.js')

  switch (argument) {
    case '--init':
      return initProject()

    case '--init-npmignore':
    case '--init-npm-ignore':
      return initNpmIgnore()

    case '--init-clang-format':
    case '--init-clangformat':
    case '--init-clang':
      return initClangFormat()
  }

  logging.banner('help')
  logging.log(`  ${name} --help              : this help screen`)
  logging.log(`  ${name} --init              : initializes a project`)
  logging.log(`  ${name} --init-npmignore    : initializes .npmignore`)
  logging.log(`  ${name} --init-clang-format : initializes .clang-format`)
  logging.log()

  if (!process.exitCode && argument !== '--help' && argument !== '--version') {
    const err = new Error(`Invalid options: ${argv.length < 3 ? '<empty>' : argv.slice(2).join(' ')}`)
    err.showStack = false
    throw err
  }
  return null
}
