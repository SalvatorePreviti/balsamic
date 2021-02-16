'use strict'

module.exports = {
  plugins: ['mocha', 'chai-expect'],
  env: {
    mocha: true
  },
  rules: {
    'global-require': 0,
    'node/no-unpublished-require': 0,
    'node/no-extraneous-import': 0,
    'node/no-extraneous-require': 0,
    'no-unused-expressions': 0, // for chai
    'mocha/no-exclusive-tests': 1,
    'mocha/no-pending-tests': 1,
    'mocha/no-skipped-tests': 0,
    'mocha/handle-done-callback': 2,
    'mocha/no-synchronous-tests': 0,
    'mocha/no-global-tests': 2,
    'mocha/no-return-and-callback': 2,
    'mocha/valid-test-description': 0,
    'mocha/valid-suite-description': 0,
    'mocha/no-mocha-arrows': 0,
    'mocha/no-hooks': 0,
    'mocha/no-hooks-for-single-case': 0,
    'mocha/no-sibling-hooks': 0,
    'mocha/no-top-level-hooks': 0,
    'mocha/no-identical-title': 0,
    'mocha/max-top-level-suites': 0,
    'mocha/no-nested-tests': 2,
    'mocha/no-setup-in-describe': 0,
    'mocha/prefer-arrow-callback': 0,
    'mocha/no-async-describe': 2,
    'chai-expect/missing-assertion': 2,
    'chai-expect/terminating-properties': 1,
    'chai-expect/no-inner-compare': 0
  }
}
