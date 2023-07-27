"use strict";

module.exports = {
  plugins: ["mocha"],
  env: {
    mocha: true,
  },
  rules: {
    "global-require": 0,
    "node/no-unpublished-require": 0,
    "node/no-extraneous-import": 0,
    "node/no-extraneous-require": 0,
    "mocha/no-exclusive-tests": 1,
    "mocha/no-pending-tests": 1,
    "mocha/no-skipped-tests": 1,
    "mocha/handle-done-callback": 2,
    "mocha/no-global-tests": 2,
    "mocha/no-return-and-callback": 2,
    "mocha/valid-suite-description": 1,
    "mocha/no-nested-tests": 2,
    "mocha/no-async-describe": 2,
  },
};
