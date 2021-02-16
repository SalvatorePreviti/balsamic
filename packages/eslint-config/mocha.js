'use strict'

const patterns = require('./lib/config.js')
const serverConfig = require('./configs/mocha.js')

module.exports = { overrides: [{ files: patterns.tests, ...serverConfig }] }
