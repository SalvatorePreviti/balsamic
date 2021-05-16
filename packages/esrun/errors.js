exports.handleUncaughtError = (error) => {
  if (!process.exitCode) {
    process.exitCode = 1
  }
  console.error('Uncaught', error && error.showStack === false ? `${error}` : error)
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
