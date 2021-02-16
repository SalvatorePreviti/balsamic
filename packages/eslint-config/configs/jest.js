'use strict'

module.exports = {
  plugins: ['jest'],
  env: {
    jest: true,
    'jest/globals': true
  },
  rules: {
    'global-require': 0,
    'node/no-unpublished-require': 0,
    'node/no-extraneous-import': 0,
    'node/no-extraneous-require': 0,
    'jest/expect-expect': 0,
    'jest/no-commented-out-tests': 1,
    'jest/no-disabled-tests': 1,
    'jest/no-export': 2,
    'jest/no-focused-tests': 1,
    'jest/no-identical-title': 0,
    'jest/no-jest-import': 0,
    'jest/no-mocks-import': 2,
    'jest/no-jasmine-globals': 1,
    'jest/no-standalone-expect': 2,
    'jest/no-done-callback': 1,
    'jest/no-test-prefixes': 0,
    'jest/no-try-expect': 2,
    'jest/valid-describe': 2,
    'jest/valid-expect': 2,
    'jest/valid-expect-in-promise': 2,
    'jest/no-alias-methods': 1,
    'jest/prefer-to-be-null': 1,
    'jest/prefer-to-be-undefined': 1,
    'jest/prefer-to-contain': 1,
    'jest/prefer-to-have-length': 1
  }
}
