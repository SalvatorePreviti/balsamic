# esrun

Transpiles in memory and runs .ts, .tsx and es6 modules using esbuild

# command line interface

Runs a .ts or .js file:

```sh
  esrun filename.ts
```

Runs a .ts or .js file in a child process, restarting and recompiling it when something changes:

```sh
  esrun --watch filename.ts
```

Note `--watch` must be the first parameter, can pass additional arguments after the file to load.

You can also use npx

```sh
npx esrun ./hello
```

# API

Runs a .ts or .js file in the same node process

```js
const esrun = require('esrun')

esrun
  .esrun({ entry: './path_to_file_to_run' })
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

const watcher = esrun.esrunChild({ entry: './path_to_file_to_run', watch: true })

// You can call stop to terminate
watcher.stop()
```
