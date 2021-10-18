# @balsamic/esrun

Install:

```sh
npm i --save-dev @balsamic/esrun
```

## command line interface for esrun

Transpiles in memory and runs .ts, .tsx and es6 modules using esbuild and native es6 modules

```
esrun <file or glob pattern to run> [arguments]
  --version         : Prints esrun and esbuild versions
  --help            : This help screen
  --time            : Measure the process execution time and prints it.
  --require=<glob>  : Adds a file or a glob pattern to require.
  --require=!<glob> : Exclude a set of patterns from require.
  --mocha           : Runs mocha tests. All arguments after this are passed to mocha.
  --no-dotenv       : Does not load .env file
```

## command line interface for esrun --build

Compiles a .ts file into .mjs, .cjs and .d.ts.
By default it compiles only .cjs and .mjs for each .ts file.
To ignore a pattern or a file, prepend ! to the pattern.

```
esrun --build [directories, files or globs pattern to build]
  --version            : Prints esrun and esbuild versions
  --help               : This help screen
  --no-cjs             : Does not generate cjs files
  --no-mjs             : Does not generate mjs files
  --baner-mjs=<banner> : Adds a banner to each compiled mjs file
  --baner-cjs=<banner> : Adds a banner to each compiled cjs file
  --dts                : Generates also .d.ts files (very slow).
  --workspaces         : Looks for .ts files in project workspaces in package.json.
  --clean              : Delete all compiled files (ignores all other options)
```

## License

MIT License

Copyright (c) 2021 Salvatore Previti
