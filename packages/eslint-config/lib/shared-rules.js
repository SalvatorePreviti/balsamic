module.exports = {
  'no-unused-vars': [
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
  paddingLineBetweenStatementsRules: [
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
}
