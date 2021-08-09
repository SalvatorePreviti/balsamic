/* eslint-disable global-require */
'use strict'

const patterns = require('../lib/config')
const serverConfig = require('./server.js')
const scriptsConfig = require('./scripts.js')
const binConfig = require('./bin.js')
const distConfig = require('./dist.js')
const config = require('../lib/config')

const tsConfigPath = config.getTsConfigPath()

const paddingLineBetweenStatementsRules = [
  { blankLine: 'always', next: 'import', prev: 'let' },
  { blankLine: 'always', next: 'import', prev: 'var' },
  { blankLine: 'always', next: '*', prev: 'directive' },
  { blankLine: 'always', next: '*', prev: 'function' },
  { blankLine: 'always', next: 'function', prev: '*' },
  { blankLine: 'always', next: '*', prev: 'class' },
  { blankLine: 'always', next: 'class', prev: '*' },
  { blankLine: 'always', next: 'export', prev: '*' },
  { blankLine: 'always', next: '*', prev: 'export' },
  { blankLine: 'always', next: 'cjs-export', prev: '*' },
  { blankLine: 'always', next: '*', prev: 'cjs-export' },
  { blankLine: 'always', next: 'cjs-import', prev: 'let' },
  { blankLine: 'always', next: 'cjs-import', prev: 'var' },
  { blankLine: 'always', next: 'cjs-import', prev: 'import' },
  { blankLine: 'always', next: 'import', prev: 'cjs-import' },
  { blankLine: 'always', next: 'class', prev: 'cjs-import' },
  { blankLine: 'always', next: 'function', prev: 'cjs-import' },
  { blankLine: 'always', next: 'let', prev: 'cjs-import' },
  { blankLine: 'always', next: 'var', prev: 'cjs-import' },
  { blankLine: 'always', next: 'class', prev: 'import' },
  { blankLine: 'always', next: 'function', prev: 'import' },
  { blankLine: 'always', next: 'let', prev: 'import' },
  { blankLine: 'always', next: 'var', prev: 'import' }
]

const jsRules = {
  'array-bracket-newline': 0,
  'array-bracket-spacing': 0,
  'array-callback-return': 2,
  'array-element-newline': 0,
  'arrow-body-style': [0, 'as-needed'],
  'arrow-parens': 0,
  'arrow-spacing': 0,
  'block-scoped-var': 2,
  'block-spacing': 0,
  'brace-style': 0,
  'callback-return': 0,
  'class-methods-use-this': 0,
  'comma-dangle': 0,
  'comma-spacing': 0,
  'comma-style': 0,
  'computed-property-spacing': 0,
  'consistent-return': [1, { treatUndefinedAsUnspecified: false }],
  curly: [1, 'all'],
  'default-case': [0, { commentPattern: '^no default$' }],
  'default-param-last': 0,
  'dot-location': [0, 'property'],
  'dot-notation': [2, { allowKeywords: true }],
  'eol-last': 0,
  eqeqeq: [1, 'always'],
  'func-call-spacing': [0, 'never'],
  'func-names': 0,
  'function-call-argument-newline': 0,
  'function-paren-newline': 0,
  'generator-star': 0,
  'generator-star-spacing': [0, { before: true, after: true }],
  'getter-return': [2, { allowImplicit: true }],
  'global-require': 1,
  'guard-for-in': 0,
  'handle-callback-err': 2,
  'implicit-arrow-linebreak': 0,
  'import/export': 2,
  'import/first': 2,
  'import/named': 0,
  'import/newline-after-import': 0,
  'import/no-absolute-path': [2, { esmodule: true, commonjs: true, amd: false }],
  'import/no-amd': 2,
  'import/no-anonymous-default-export': 0,
  'import/no-duplicates': 1,
  'import/no-extraneous-dependencies': [
    0,
    { devDependencies: true, optionalDependencies: false, peerDependencies: true }
  ],
  'import/no-named-as-default': 1,
  'import/no-named-as-default-member': 1,
  'import/no-self-import': 2,
  'import/no-unresolved': [2, { commonjs: true, caseSensitive: true }],
  'import/no-useless-path-segments': [1, { noUselessIndex: false }],
  'import/no-webpack-loader-syntax': 2,
  'import/order': [
    0,
    { groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'], 'newlines-between': 'never' }
  ],
  indent: 0,
  'indent-legacy': 0,
  'jsx-quotes': 0,
  'key-spacing': [0, { beforeColon: false, afterColon: true }],
  'keyword-spacing': [0, { before: true, after: true }],
  'linebreak-style': 0,
  'lines-around-comment': 0,
  'lines-between-class-members': [1, 'always', { exceptAfterSingleLine: true }],
  'max-len': [0, 120],
  'multiline-ternary': [0, 'always-multiline'],
  'new-cap': [0, { newIsCap: true, capIsNew: false, properties: true }],
  'new-parens': 0,
  'newline-per-chained-call': 0,
  'no-alert': 2,
  'no-arrow-condition': 0,
  'no-await-in-loop': 0,
  'no-bitwise': 0,
  'no-buffer-constructor': 2,
  'no-caller': 2,
  'no-catch-shadow': 0,
  'no-comma-dangle': 0,
  'no-cond-assign': [2, 'always'],
  'no-confusing-arrow': 0,
  'no-console': 1,
  'no-constant-condition': [1, { checkLoops: false }],
  'no-control-regex': 0,
  'no-debugger': 1,
  'no-duplicate-imports': 1,
  'no-else-return': 1,
  'no-empty': [2, { allowEmptyCatch: true }],
  'no-empty-pattern': 1,
  'no-eval': 2,
  'no-extend-native': 0,
  'no-extra-bind': 1,
  'no-extra-boolean-cast': 1,
  'no-extra-label': 2,
  'no-extra-parens': 0,
  'no-floating-decimal': 0,
  'no-global-assign': [2, { exceptions: [] }],
  'no-implicit-globals': 2,
  'no-implied-eval': 0,
  'no-invalid-this': 0,
  'no-iterator': 0,
  'no-label-var': 2,
  'no-labels': [0, { allowLoop: true, allowSwitch: false }],
  'no-lone-blocks': 1,
  'no-lonely-if': 2,
  'no-loop-func': 2,
  'no-mixed-operators': [
    1,
    {
      allowSamePrecedence: false,
      groups: [
        ['&', '|', '^', '~', '<<', '>>', '>>>'],
        ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
        ['&&', '||'],
        ['in', 'instanceof']
      ]
    }
  ],
  'no-mixed-spaces-and-tabs': 0,
  'no-multi-assign': 2,
  'no-multi-spaces': 0,
  'no-multi-str': 2,
  'no-multiple-empty-lines': [0, { max: 1, maxEOF: 0 }],
  'no-native-reassign': 1,
  'no-negated-in-lhs': 1,
  'no-nested-ternary': 0,
  'no-new': 2,
  'no-new-func': 2,
  'no-new-object': 2,
  'no-new-require': 2,
  'no-new-wrappers': 2,
  'no-octal-escape': 2,
  'no-param-reassign': 0,
  'no-path-concat': 2,
  'no-process-exit': 2,
  'no-proto': 2,
  'no-reserved-keys': 0,
  'no-restricted-globals': [
    2,
    'addEventListener',
    'blur',
    'close',
    'closed',
    'confirm',
    'defaultStatus',
    'defaultstatus',
    'event',
    'external',
    'find',
    'focus',
    'frameElement',
    'frames',
    'history',
    'innerHeight',
    'innerWidth',
    'length',
    'location',
    'locationbar',
    'menubar',
    'moveBy',
    'moveTo',
    'name',
    'onblur',
    'onerror',
    'onfocus',
    'onload',
    'onresize',
    'onunload',
    'open',
    'opener',
    'opera',
    'outerHeight',
    'outerWidth',
    'pageXOffset',
    'pageYOffset',
    'parent',
    'print',
    'removeEventListener',
    'resizeBy',
    'resizeTo',
    'screen',
    'screenLeft',
    'screenTop',
    'screenX',
    'screenY',
    'scroll',
    'scrollbars',
    'scrollBy',
    'scrollTo',
    'scrollX',
    'scrollY',
    'self',
    'status',
    'statusbar',
    'stop',
    'toolbar',
    'top'
  ],
  'no-restricted-syntax': [
    2,
    { selector: 'WithStatement', message: 'with statement is deprecated' },
    { selector: 'SequenceExpression', message: 'The comma operator is confusing and a common mistake.' }
  ],
  'no-return-assign': [0, 'except-parens'],
  'no-return-await': 2,
  'no-script-url': 2,
  'no-self-assign': 1,
  'no-self-compare': 1,
  'no-sequences': 2,
  'no-setter-return': 1,
  'no-shadow': 1,
  'no-shadow-restricted-names': 1,
  'no-space-before-semi': 0,
  'no-spaced-func': 0,
  'no-tabs': [0, { allowIndentationTabs: true }],
  'no-template-curly-in-string': 2,
  'no-throw-literal': 2,
  'no-trailing-spaces': 0,
  'no-undef-init': 2,
  'no-underscore-dangle': 0,
  'no-unexpected-multiline': 0,
  'no-unmodified-loop-condition': 2,
  'no-unreachable': 1,
  'no-unused-expressions': [
    1,
    { allowShortCircuit: false, allowTaggedTemplates: false, allowTernary: false, enforceForJSX: true }
  ],
  'no-unused-vars': [
    1,
    {
      args: 'after-used',
      ignoreRestSiblings: true,
      vars: 'all',
      argsIgnorePattern: '^_|^react$|^req$|^res$|^next$',
      varsIgnorePattern: '^_|^React$',
      caughtErrorsIgnorePattern: '^_'
    }
  ],
  'no-use-before-define': [2, { classes: false, functions: false }],
  'no-useless-call': 1,
  'no-useless-computed-key': 1,
  'no-useless-concat': 1,
  'no-useless-constructor': 1,
  'no-useless-escape': 1,
  'no-useless-rename': [2, { ignoreDestructuring: false, ignoreExport: false, ignoreImport: false }],
  'no-useless-return': 1,
  'no-var': 2,
  'no-void': 2,
  'no-whitespace-before-property': 0,
  'no-wrap-func': 0,
  'node/exports-style': [0, 'module.exports'],
  'node/no-deprecated-api': 2,
  'node/no-exports-assign': 2,
  'node/no-extraneous-import': 0,
  'node/no-extraneous-require': 0,
  'node/no-missing-import': 0,
  'node/no-missing-require': 0,
  'node/no-unpublished-bin': 2,
  'node/no-unpublished-import': 0,
  'node/no-unpublished-require': 2,
  'node/no-unsupported-features/es-builtins': 2,
  'node/no-unsupported-features/es-syntax': 0,
  'node/no-unsupported-features/node-builtins': 2,
  'node/process-exit-as-throw': 2,
  'node/shebang': 0,
  'nonblock-statement-body-position': 0,
  'object-curly-newline': [0, { multiline: true, consistent: true }],
  'object-curly-spacing': [0, 'never'],
  'object-property-newline': [0, { allowMultiplePropertiesPerLine: true }],
  'object-shorthand': [1, 'always', { avoidQuotes: true, ignoreConstructors: false }],
  'one-var': [1, 'never'],
  'one-var-declaration-per-line': [0, 'always'],
  'operator-assignment': [1, 'always'],
  'operator-linebreak': [0, 'after', { overrides: { '?': 'before', ':': 'before', '|>': 'before' } }],
  'padded-blocks': [0, { blocks: 'never', switches: 'never', classes: 'never' }],
  'padding-line-between-statements': [0, ...paddingLineBetweenStatementsRules],
  'prefer-arrow-callback': [1, { allowNamedFunctions: true, allowUnboundThis: true }],
  'prefer-const': [1, { destructuring: 'any', ignoreReadBeforeAssign: true }],
  'prefer-exponentiation-operator': 1,
  'prefer-numeric-literals': 1,
  'prefer-regex-literals': 1,
  'prefer-rest-params': 1,
  'prefer-spread': 1,
  'prefer-template': 1,
  'quick-prettier/prettier': [
    1,
    {
      'prettify-package-json': true,
      rules: {
        'padding-line-between-statements': [1, ...paddingLineBetweenStatementsRules],
        'import/newline-after-import': 1
      }
    }
  ],
  'quote-props': [0, 'as-needed', { keywords: false, numbers: false, unnecessary: true }],
  quotes: 0,
  'require-atomic-updates': 0,
  'rest-spread-spacing': [0, 'never'],
  semi: 0,
  'semi-spacing': [0, { before: false, after: true }],
  'semi-style': 0,
  'space-after-function-name': 0,
  'space-after-keywords': 0,
  'space-before-blocks': [0, 'always'],
  'space-before-function-paren': [0, 'always'],
  'space-before-function-parentheses': 0,
  'space-before-keywords': 0,
  'space-in-brackets': 0,
  'space-in-parens': [0, 'never'],
  'space-infix-ops': 0,
  'space-return-throw-case': 0,
  'space-unary-ops': [0, { words: true, nonwords: false }],
  'space-unary-word-ops': 0,
  strict: [0, 'never'],
  'switch-colon-spacing': 0,
  'symbol-description': 1,
  'template-curly-spacing': 0,
  'template-tag-spacing': [0, 'never'],
  'unicode-bom': [0, 'never'],
  'valid-jsdoc': 0,
  'vars-on-top': 0,
  'wrap-iife': 0,
  'wrap-regex': 0,
  'yield-star-spacing': 0,
  yoda: [2, 'never'],
  'default-case-last': 2,
  'import/no-named-default': 0,
  'no-loss-of-precision': 2,
  'no-redeclare': [2, { builtinGlobals: false }],
  'no-unneeded-ternary': [2, { defaultAssignment: false }],
  'no-unreachable-loop': 2,
  'no-useless-backreference': 2,
  'node/handle-callback-err': [2, '^(err|error)$'],
  'node/no-callback-literal': 2,
  'node/no-new-require': 2,
  'node/no-path-concat': 2,
  'prefer-promise-reject-errors': 2,
  'spaced-comment': [
    1,
    'always',
    {
      line: { markers: ['*package', '!', '/', ',', '=', '*', '@', '#'], exceptions: ['/', '*', '+', '-', '=', '_'] },
      block: {
        balanced: true,
        markers: ['*package', '!', ',', ':', '::', 'flow-include'],
        exceptions: [
          '*',
          '@',
          '#',
          '@__INLINE__',
          '@__NOINLINE__',
          '@__PURE__',
          '#__INLINE__',
          '#__NOINLINE__',
          '#__PURE__'
        ]
      }
    }
  ],
  'use-isnan': [2, { enforceForSwitchCase: true, enforceForIndexOf: true }],
  'valid-typeof': [2, { requireStringLiterals: true }],
  'ban-ts-comment': 0,
  'ban-types': 0,
  camelcase: 0,
  'class-name-casing': 0,
  'consistent-type-assertions': 0,
  'consistent-type-definitions': 0,
  'explicit-function-return-type': 0,
  'explicit-module-boundary-types': 0,
  'interface-name-prefix': 0,
  'no-array-constructor': 0,
  'no-dupe-class-members': 2,
  'no-empty-function': 0,
  'no-empty-interface': 0,
  'no-explicit-any': 0,
  'no-extra-semi': 0,
  'no-inferrable-types': 0,
  'no-namespace': 0,
  'no-non-null-assertion': 0,
  'no-parameter-properties': 0,
  'no-this-alias': 0,
  'no-unsafe-assignment': 0,
  'no-unsafe-call': 0,
  'no-unsafe-member-access': 0,
  'no-unsafe-return': 0,
  'no-var-requires': 0,
  'prefer-includes': 0,
  'require-await': 0,
  'restrict-template-expressions': 0,
  'triple-slash-reference': 0,
  'unbound-method': 0,
  'import/namespace': 0,

  'mocha/no-synchronous-tests': 0,
  'mocha/no-mocha-arrows': 0,
  'mocha/no-hooks': 0,
  'mocha/no-hooks-for-single-case': 0,
  'mocha/no-sibling-hooks': 0,
  'mocha/no-top-level-hooks': 0,
  'mocha/no-identical-title': 0,
  'mocha/max-top-level-suites': 0,
  'mocha/no-setup-in-describe': 0,
  'mocha/prefer-arrow-callback': 0,
  'chai-expect/no-inner-compare': 0
}

const typescriptRules = {
  '@typescript-eslint/array-type': 1,
  '@typescript-eslint/ban-ts-comment': 0,
  '@typescript-eslint/ban-types': 0,
  '@typescript-eslint/brace-style': 0,
  '@typescript-eslint/camelcase': 0,
  '@typescript-eslint/class-name-casing': 0,
  '@typescript-eslint/consistent-type-assertions': 0,
  '@typescript-eslint/consistent-type-definitions': 0,
  '@typescript-eslint/default-param-last': 0,
  '@typescript-eslint/explicit-function-return-type': 0,
  '@typescript-eslint/explicit-module-boundary-types': 0,
  '@typescript-eslint/func-call-spacing': [0, 'never'],
  '@typescript-eslint/indent': 0,
  '@typescript-eslint/interface-name-prefix': 0,
  '@typescript-eslint/lines-between-class-members': [1, 'always', { exceptAfterSingleLine: true }],
  '@typescript-eslint/member-delimiter-style': [
    1,
    { multiline: { delimiter: 'none', requireLast: false }, singleline: { delimiter: 'semi', requireLast: false } }
  ],
  '@typescript-eslint/no-array-constructor': 0,
  '@typescript-eslint/no-dupe-class-members': 2,
  '@typescript-eslint/no-duplicate-imports': 1,
  '@typescript-eslint/no-empty-function': 0,
  '@typescript-eslint/no-empty-interface': 0,
  '@typescript-eslint/no-explicit-any': 0,
  '@typescript-eslint/no-extra-parens': 0,
  '@typescript-eslint/no-extra-semi': 0,
  '@typescript-eslint/no-implied-eval': 0,
  '@typescript-eslint/no-inferrable-types': 0,
  '@typescript-eslint/no-invalid-this': 0,
  '@typescript-eslint/no-loop-func': 2,
  '@typescript-eslint/no-namespace': 0,
  '@typescript-eslint/no-non-null-assertion': 0,
  '@typescript-eslint/no-parameter-properties': 0,
  '@typescript-eslint/no-redeclare': [2, { builtinGlobals: false, ignoreDeclarationMerge: true }],
  '@typescript-eslint/no-shadow': 1,
  '@typescript-eslint/no-this-alias': 0,
  '@typescript-eslint/no-unsafe-assignment': 0,
  '@typescript-eslint/no-unsafe-call': 0,
  '@typescript-eslint/no-unsafe-member-access': 0,
  '@typescript-eslint/no-unsafe-return': 0,
  '@typescript-eslint/no-unused-expressions': [
    1,
    { allowShortCircuit: false, allowTaggedTemplates: false, allowTernary: false, enforceForJSX: true }
  ],
  '@typescript-eslint/no-use-before-define': [
    2,
    { classes: false, functions: false, typedefs: false, enums: true, ignoreTypeReferences: true }
  ],
  '@typescript-eslint/no-useless-constructor': 1,
  '@typescript-eslint/no-var-requires': 0,
  '@typescript-eslint/prefer-includes': 0,
  '@typescript-eslint/quotes': 0,
  '@typescript-eslint/require-await': 0,
  '@typescript-eslint/restrict-template-expressions': 0,
  '@typescript-eslint/semi': 0,
  '@typescript-eslint/space-before-function-paren': [0, 'always'],
  '@typescript-eslint/triple-slash-reference': 0,
  '@typescript-eslint/type-annotation-spacing': 1,
  '@typescript-eslint/unbound-method': 0,
  '@typescript-eslint/no-unused-vars': [
    1,
    {
      args: 'after-used',
      ignoreRestSiblings: true,
      vars: 'all',
      argsIgnorePattern: '^_|^react$|^req$|^res$|^next$',
      varsIgnorePattern: '^React$',
      caughtErrorsIgnorePattern: '^_'
    }
  ],
  'no-shadow': 0,
  'no-redeclare': [0, { builtinGlobals: false }],
  'func-call-spacing': [0, ['never']],
  'lines-between-class-members': [0, ...jsRules['lines-between-class-members'].slice(1)],
  'no-duplicate-imports': 0,
  'no-loop-func': 0,
  'no-unused-expressions': [0, ...jsRules['no-unused-expressions'].slice(1)],
  'space-before-function-paren': [0, ['always']],
  'no-unused-vars': [0, ...jsRules['no-unused-vars'].slice(1)],
  'no-use-before-define': [0, ...jsRules['no-use-before-define'].slice(1)]
}

const tsProjectRules = {
  '@typescript-eslint/adjacent-overload-signatures': 1,
  '@typescript-eslint/await-thenable': 2,
  '@typescript-eslint/dot-notation': [2, { allowKeywords: true }],
  '@typescript-eslint/no-extra-non-null-assertion': 2,
  '@typescript-eslint/no-floating-promises': 2,
  '@typescript-eslint/no-for-in-array': 2,
  '@typescript-eslint/no-misused-new': 2,
  '@typescript-eslint/no-misused-promises': 2,
  '@typescript-eslint/no-non-null-asserted-optional-chain': 2,
  '@typescript-eslint/no-throw-literal': 2,
  '@typescript-eslint/no-unnecessary-type-assertion': 2,
  '@typescript-eslint/prefer-as-const': 2,
  '@typescript-eslint/prefer-namespace-keyword': 1,
  '@typescript-eslint/prefer-regexp-exec': 2,
  '@typescript-eslint/restrict-plus-operands': 2
}

const _testOverrides = {
  files: patterns.tests,
  rules: {
    'global-require': 0,
    'node/no-unpublished-require': 0,
    'node/no-extraneous-import': 0,
    'node/no-extraneous-require': 0,
    'no-unused-expressions': 0, // for chai
    '@typescript-eslint/no-unused-expressions': 0 // for chai
  }
}

if (config.getHasMocha()) {
  const mochaConfig = require('./mocha')
  _testOverrides.plugins = [...(_testOverrides.plugins || []), ...mochaConfig.plugins]
  _testOverrides.env = { ..._testOverrides.env, ...mochaConfig.env }
  _testOverrides.rules = { ..._testOverrides.rules, ...mochaConfig.rules }
}

if (config.getHasChai()) {
  const chaiConfig = require('./chai')
  _testOverrides.plugins = [...(_testOverrides.plugins || []), ...chaiConfig.plugins]
  _testOverrides.rules = { ..._testOverrides.rules, ...chaiConfig.rules }
}

if (config.getHasJest()) {
  const jestConfig = require('./jest')
  _testOverrides.plugins = [...(_testOverrides.plugins || []), ...jestConfig.plugins]
  _testOverrides.env = { ..._testOverrides.env, ...jestConfig.env }
  _testOverrides.rules = { ..._testOverrides.rules, ...jestConfig.rules }
}

const eslintConfig = {
  env: { browser: true, es2020: true, node: true },
  ignorePatterns: config.getIgnorePatterns(),
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    tsConfigPath
      ? 'plugin:@typescript-eslint/recommended-requiring-type-checking'
      : 'plugin:@typescript-eslint/recommended'
  ],
  overrides: [
    { files: patterns.sourceExtensions.map((x) => `*${x}`) },
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'import/export': 0,
        '@typescript-eslint/explicit-member-accessibility': 1
      }
    },
    {
      files: ['*.d.ts', '*.d.tsx'],
      rules: {
        'no-var': 0,
        'import/export': 0,
        'import/no-default-export': 0,
        '@typescript-eslint/explicit-member-accessibility': 0
      }
    },
    {
      files: ['*.jsx', '*.tsx'],
      env: { browser: true },
      parserOptions: { jsx: true },
      rules: { '@typescript-eslint/no-var-requires': 2, 'node/shebang': 2 }
    },
    {
      files: ['*.mjs', '*.es', '*.es6', '*.jsx', '*.tsx'],
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2021,
        ecmaFeatures: {
          globalReturn: false
        }
      }
    },
    { files: patterns.server, ...serverConfig },
    { files: patterns.scripts, ...scriptsConfig },
    { files: patterns.bin, ...binConfig },
    { files: patterns.dist, ...distConfig },
    _testOverrides
  ],
  parserOptions: {
    ecmaFeatures: { globalReturn: false, impliedStrict: true, jsx: false },
    ecmaVersion: 2021,
    project: tsConfigPath
  },
  plugins: ['node', 'import', '@typescript-eslint', 'quick-prettier'],
  rules: { ...jsRules, ...typescriptRules },
  settings: {
    'import/core-modules': ['electron', 'aws-sdk'],
    'import/extensions': patterns.importableExtensions,
    'import/external-module-folders': ['node_modules', 'node_modules/@types', 'dist'],
    'import/parsers': { '@typescript-eslint/parser': patterns.sourceExtensions },
    'import/resolver': {
      node: { extensions: patterns.importableExtensions }
    }
  }
}

if (config.getHasReact()) {
  const reactConfig = require('./react')
  eslintConfig.extends = [...eslintConfig.extends, ...reactConfig.extends]
  eslintConfig.rules = { ...eslintConfig.rules, ...reactConfig.rules }
  eslintConfig.settings = { ...eslintConfig.settings, ...reactConfig.settings }
}

if (tsConfigPath) {
  eslintConfig.rules = { ...eslintConfig.rules, ...tsProjectRules }
}

module.exports = eslintConfig
