const { resolve: pathResolve, dirname: pathDirname, join: pathJoin } = require('path')
const { readFileSync: fsReadFileSync, realpathSync: fsRealPathSync, statSync: fsStatSync } = require('fs')

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
      (_tsConfigPath !== undefined ? _tsConfigPath : (_tsConfigPath = _findFileInParents('tsconfig.json'))) || undefined
    )
  }
}

function loadIgnorePatterns() {
  return fsReadFileSync(pathResolve(__dirname, '../.eslintignore'), 'utf-8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^\s*#/.test(s))
}

function _findFileInParents(filename) {
  let dir = process.cwd()
  if (dir.indexOf('node_modules') > 0) {
    dir = fsRealPathSync(dir)
  }
  for (;;) {
    const configFile = pathJoin(dir, filename)
    if (_isFile(configFile)) {
      return configFile
    }
    const parent = pathDirname(dir)
    if (dir.length <= parent.length) {
      return ''
    }
    dir = parent
  }
}

function _isFile(filename) {
  try {
    const stats = fsStatSync(filename)
    return stats.isFile() || stats.isFIFO()
  } catch (_) {}
  return false
}
