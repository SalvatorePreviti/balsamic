# esrun

Transpiles in memory and runs .ts, .tsx and es6 modules using esbuild and native es6 modules

# command line interface

```
Usage: esrun [--time] [--require=<glob>] [--mocha] <file or glob pattern to run> [arguments]
--time : Measure the process execution time and prints it.
--require=<glob> : Adds a file or a glob pattern to require.
--require=!<glob> : Exclude a set of patterns from require.
--mocha : Runs mocha tests. All arguments after this are passed to mocha.
```
