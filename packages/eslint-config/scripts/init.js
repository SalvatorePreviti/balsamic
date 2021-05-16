#!/usr/bin/env node
'use strict'

const logging = require('./lib/logging')
const { initProject, initClangFormat } = require('./lib/init-project')

process.on('uncaughtException', logging.handleUncaughtError)

if (process.argv.includes('help') || process.argv.includes('--help')) {
  logging.banner('help')
  logging.info(`${process.argv[1]} help          : this help screen`)
  logging.info(`${process.argv[1]} clang-format  : initializes clang-format`)
} else if (process.argv.includes('clang-format') || process.argv.includes('clang')) {
  initClangFormat()
} else {
  initProject()
}
