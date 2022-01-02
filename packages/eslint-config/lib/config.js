const { resolve: pathResolve } = require('path')
const { readFileSync: fsReadFileSync } = require('fs')
const { findFileInParents } = require('./utils')
const Module = require('module')

const sourceNodeExtensions = ['.ts', '.tsx', '.jsx', '.js', '.mjs', '.cjs']

/** @type {string[]} */
let _ignorePatterns

let _tsConfigPath = ''

module.exports = {
  sourceExtensions: [...sourceNodeExtensions, '._js', '.es', '.es6'],
  importableExtensions: [...sourceNodeExtensions, '.json', '.node'],
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
  },
  getHasChai,
  getHasMocha,
  getHasReact,
  getHasJest
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

const _hasPackageCache = new Map()
let _hasPackageResolver

function _hasPackage(name) {
  let result = _hasPackageCache.get(name)
  if (result !== undefined) {
    return result
  }
  result = false
  if (!_hasPackageResolver) {
    _hasPackageResolver = Module.createRequire(process.cwd())
  }
  try {
    _hasPackageResolver.resolve(name)
    result = true
  } catch (_) {}
  _hasPackageCache.set(name, result)
  return result
}

function getHasChai() {
  return _hasPackage('chai') && _hasPackage('eslint-plugin-chai-expect')
}

function getHasMocha() {
  return _hasPackage('mocha') && _hasPackage('eslint-plugin-mocha')
}

function getHasReact() {
  return _hasPackage('react') && _hasPackage('eslint-plugin-react') && _hasPackage('eslint-plugin-react-hooks')
}

function getHasJest() {
  return _hasPackage('jest') && _hasPackage('eslint-plugin-jest')
}
