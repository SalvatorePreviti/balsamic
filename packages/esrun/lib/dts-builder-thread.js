'use strict'

const { parentPort, workerData } = require('worker_threads')
require('v8-compile-cache')

const tscBuilder = require('./dts-builder')

tscBuilder
  .buildDts(workerData)
  .then((result) => {
    parentPort.postMessage(result)
  })
  .catch((error) => {
    parentPort.postMessage(error)
  })
