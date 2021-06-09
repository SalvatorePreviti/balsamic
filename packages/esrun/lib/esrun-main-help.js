exports.printVersion = function printVersion() {
  console.info(getVersion())
}

exports.printHelp = function printHelp() {
  console.error(
    [
      '',
      getVersion(),
      '',
      'To execute ts, tsx, es6 modules:',
      '',
      'esrun <file or glob pattern to run> [arguments]',
      '  --version         : Prints esrun and esbuild versions',
      '  --help            : This help screen',
      '  --time            : Measure the process execution time and prints it.',
      '  --require=<glob>  : Adds a file or a glob pattern to require.',
      '  --require=!<glob> : Exclude a set of patterns from require.',
      '  --mocha           : Runs mocha tests. All arguments after this are passed to mocha.',
      '',
      'To build projects:',
      '',
      'esrun --build [directories, files or globs pattern to build]',
      '  --version            : Prints esrun and esbuild versions',
      '  --help               : This help screen',
      '  --no-cjs             : Does not generate cjs files',
      '  --no-mjs             : Does not generate mjs files',
      '  --baner-mjs=<banner> : Adds a baner to each compiled mjs file',
      '  --baner-cjs=<banner> : Adds a baner to each compiled cjs file',
      '  --dts                : Generates also .d.ts files (very slow).',
      '  --workspaces         : Looks for .ts files in project workspaces in package.json.',
      '  --clean              : Delete all compiled files (ignores all other options)',
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
