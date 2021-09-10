const chalk = require('chalk')

exports.printVersion = function printVersion() {
  console.info(getVersion())
}

exports.printHelp = function printHelp() {
  console.error(
    [
      '',
      chalk.greenBright(getVersion()),
      '',
      'To execute ts, tsx, es6 modules:',
      '',
      chalk.greenBright('esrun <file or glob pattern to run> [arguments]'),
      '  --version         : Prints esrun and esbuild versions',
      '  --help            : This help screen',
      '  --time            : Measure the process execution time and prints it.',
      '  --bundle          : Bundles all imports in a single script, alters the way import works but useful to test performance of bundled code',
      '  --require=<glob>  : Adds a file or a glob pattern to require.',
      '  --require=!<glob> : Exclude a set of patterns from require.',
      '  --mocha           : Runs mocha tests. All arguments after this are passed to mocha.',
      '',
      'To build projects:',
      '',
      chalk.greenBright('esrun --build [directories, files or globs pattern to build]'),
      '  --version            : Prints esrun and esbuild versions',
      '  --outdir=<directory> : Output directory. If not specified, files are compiled alongside source',
      '  --help               : This help screen',
      '  --no-cjs             : Does not generate cjs files',
      '  --no-mjs             : Does not generate mjs files',
      '  --baner-mjs=<banner> : Adds a banner to each compiled mjs file',
      '  --baner-cjs=<banner> : Adds a banner to each compiled cjs file',
      '  --dts                : Generates also .d.ts files (very slow).',
      '  --workspaces         : Looks for .ts files in project workspaces in package.json.',
      '  --clean              : Delete all compiled files (ignores all other options)',
      '  --sourcemap=<value>  : Accepted values are external, inline, both, false. Default is external',
      ''
    ].join('\n')
  )
}

function getVersion() {
  const pkg = require('../package.json')

  let esbuildVersion
  try {
    esbuildVersion = `, esbuild v${require('esbuild/package.json').version}`
  } catch (_) {
    // ignore error
  }

  return `${pkg.name} v${pkg.version}${esbuildVersion || ''}`
}
