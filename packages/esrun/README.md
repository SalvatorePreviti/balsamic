# esrun

Transpiles in memory and runs .ts, .tsx and es6 modules using esbuild.
Supports file watching.

# command line interface

Runs a .ts or .js file:

```sh
  esrun filename.ts [arguments]
```

You can also use npx

```sh
npx esrun ./hello
```

Runs a .ts or .js file in a child process, restarting and recompiling it when something changes:

```sh
  esrun --watch filename.ts
```

Note `--watch` must be the first parameter, can pass additional arguments after the file to load.

```sh
  esrun -r file-to-include.ts filename.ts
```

-r flag adds files or glob patterns (wildcards) to include.
To exclude a glob, use -r !glob

# API

Runs a .ts or .js file in the same node process

```js
const esrun = require('@balsamic/esrun')

esrun
  .esrun({ main: './path_to_file_to_run' })
  .then(() => {
    console.log('completed')
  })
  .catch((error) => {
    console.log(error)
  })
```

Runs a .ts or .js file in a child process, restarting and recompiling it when something changes:

```js
const esrun = require('esrun')

const watcher = esrun.esrunChild({ main: './path_to_file_to_run', watch: true })

// ... more code ...

// You can call stop to terminate
watcher.stop()
```
