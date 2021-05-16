const { resolve: pathResolve } = require('path')
const { readFileSync: fsReadFileSync } = require('fs')
const { findFileInParents } = require('./utils')

const sourceExtensions = ['.ts', '.tsx', '.jsx', '.js', '.mjs', '.cjs', '._js', '.es', '.es6']

/** @type {string[]} */
let _ignorePatterns

let _tsConfigPath = ''

module.exports = {
  sourceExtensions,
  importableExtensions: [...sourceExtensions, '.json'],
  server: ['**/server/**/*', '**/dev-server/**/*'],
  bin: ['**/bin/**/*', '**/.bin/**/*'],
  dist: [
    '**/dist/**/*',
    '**/out/**/*',
    '**/_dist/**/*',
    '**/_out/**/*',
    '**/.dist/**/*',
    '**/.out/**/*',
    '**/wasm/**/*',
    '**/emscripten/**/*'
  ],
  scripts: [
    '**/dev-server/**/*',
    '**/scripts/**/*',
    '**/dev/**/*',
    '**/bin/**/*',
    '**/.bin/**/*',
    '**/build/**/*',
    '.eslintrc.js',
    'webpack.config.*',
    'webpack.*.config.*',
    'jest-*.*',
    '**/testUtils/**/*',
    '**/__mocks__/**/*',
    'Gruntfile.js',
    'gulpfile.js',
    'Gulpfile.js',
    '**/gulp/**/*',
    '**/grunt/**/*',
    '*-jest-*.*',
    '**/.mocharc.*'
  ],
  tests: [
    '*.test.*',
    '*.spec.*',
    '**/test/**/*',
    '**/tests/**/*',
    '**/*-test/**/*',
    '**/*-tests/**/*',
    '**/__mocks__/**/*',
    '**/__specs__/**/*',
    '**/__tests__/**/*',
    '**/__mock__/**/*',
    '**/__spec__/**/*',
    '**/__test__/**/*',
    '**/testUtils/**/*',
    '*-jest-*.*',
    '**/.mocharc.*'
  ],
  getIgnorePatterns() {
    return _ignorePatterns || (_ignorePatterns = loadIgnorePatterns())
  },
  getTsConfigPath() {
    return (
      (_tsConfigPath !== undefined ? _tsConfigPath : (_tsConfigPath = findFileInParents('tsconfig.json'))) || undefined
    )
  }
}

function loadIgnorePatternsFromFile(filename) {
  return fsReadFileSync(filename, 'utf-8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\s*#/.test(s))
}

function loadIgnorePatterns() {
  return loadIgnorePatternsFromFile(pathResolve(__dirname, '../.eslintignore'))
}
