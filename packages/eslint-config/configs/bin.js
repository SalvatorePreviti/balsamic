'use strict'

const scriptsConfig = require('./scripts')

module.exports = {
  ...scriptsConfig,
  rules: {
    ...scriptsConfig.rules,
    'node/no-missing-require': 0,
    'import/no-unresolved': 0
  }
}
