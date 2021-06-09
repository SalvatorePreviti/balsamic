#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')
const fastglob = require('fast-glob')
const esbuild = require('esbuild')
const errors = require('./errors.js')

const defaultIgnores = ['**/node_modules/**', '**/.*/**', '**/*.d.ts']

module.exports = {
  getTsPatterns,
  getTsFiles,
  compileDtsFiles,
  compileSourceFiles,
  esrunBuildMain,
  cleanOutputFiles
}

Reflect.defineProperty(module.exports, '__esModule', { value: true })

class SearchDirectories {
  constructor(patterns, workspaces) {
    this.patterns = new Set()
    this.hasSearchPatterns = false
    this.workspaces = workspaces
    this.add(patterns)
  }

  add(pattern) {
    if (!pattern) {
      return
    }
    if (typeof pattern !== 'string') {
      if (Array.isArray(pattern)) {
        for (const item of pattern) {
          this.add(item)
        }
      }
      return
    }

    const negations = pattern.match(/^!+/)
    if (negations) {
      pattern = pattern.substr(negations[0].length)
    }

    if (this.workspaces) {
      pattern = pattern.replace(/^\/+/, '')
    } else if (!pattern.endsWith('.ts') && !pattern.endsWith('.tsx') && !pattern.endsWith('/')) {
      pattern += '/'
    }

    if (negations && negations[0].length % 2 === 1) {
      pattern = `!${pattern}`
    } else {
      this.hasSearchPatterns = true
    }
    this.patterns.add(pattern)
  }
}

async function getTsPatterns({ addWorkspaces = false, input = [], cwd = process.cwd() }) {
  const inputPatterns = new SearchDirectories(input, false)
  if (addWorkspaces) {
    inputPatterns.add(await getWorkspaceDirectories(cwd))
  }

  if (!inputPatterns.hasSearchPatterns) {
    return null
  }

  for (const patternToIgnore of defaultIgnores) {
    inputPatterns.add(`!${patternToIgnore}`)
  }

  const patterns = []
  for (const pattern of inputPatterns.patterns) {
    if (pattern.startsWith('!')) {
      patterns.push(pattern)
      continue
    }
    if (pattern.endsWith('.ts') || pattern.endsWith('.tsx')) {
      patterns.push(pattern)
      continue
    }
    patterns.push(`${pattern}**/*.{ts,tsx}`)
  }

  return patterns
}

async function getTsFiles({ patterns, cwd = process.cwd() }) {
  cwd = cwd ? path.resolve(cwd) : process.cwd()
  return fastglob(patterns, {
    cwd,
    ignore: defaultIgnores,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: true,
    suppressErrors: true,
    unique: true
  })
}

async function compileDtsFiles({ files, cwd }) {
  cwd = cwd ? path.resolve(cwd) : process.cwd()
  const { Worker } = require('worker_threads')
  const worker = new Worker(path.resolve(__dirname, './lib/dts-builder-thread.js'), {
    workerData: { files, cwd }
  })
  return new Promise((resolve, reject) => {
    worker.on('error', (err) => {
      if (reject) {
        reject(err)
        reject = null
      }
    })
    worker.on('exit', () => {
      if (reject) {
        reject(new Error('Thread terminated'))
        reject = null
      }
    })
    worker.on('message', (result) => {
      if (result === true) {
        reject = null
        resolve(true)
      } else if (result === false) {
        reject = null
        resolve(false)
      } else if (reject) {
        reject(result)
      }
    })
  })
}

async function esrunBuildMain(args = process.argv.slice(2), cwd = process.cwd()) {
  let addWorkspaces = false
  let help = false
  let hasInvalidArg = false
  let cjs = true
  let mjs = true
  let dts = false
  let clean = false
  const baner_cjs = []
  const baner_mjs = []
  const inputPatterns = []
  for (const arg of args) {
    if (arg.startsWith('--banner-mjs=')) {
      baner_mjs.push(arg.slice('--banner-mjs='.length))
    } else if (arg.startsWith('--banner-cjs=')) {
      baner_cjs.push(arg.slice('--banner-cjs='.length))
    } else if (arg === '--dts') {
      dts = true
    } else if (arg === '--no-dts') {
      dts = false
    } else if (arg === '--cjs') {
      cjs = true
    } else if (arg === '--no-cjs') {
      cjs = false
    } else if (arg === '--mjs') {
      mjs = true
    } else if (arg === '--no-mjs') {
      mjs = false
    } else if (arg === '--workspaces') {
      addWorkspaces = true
    } else if (arg === '--no-workspaces') {
      addWorkspaces = false
    } else if (arg === '--help') {
      help = true
    } else if (arg === '--clean') {
      clean = true
    } else if (arg.startsWith('--')) {
      hasInvalidArg = true
    } else {
      inputPatterns.push(arg)
    }
  }

  const hasEmptyArgs = !addWorkspaces && !inputPatterns
  if (help || hasInvalidArg || hasEmptyArgs) {
    const messages = [
      'Usage: esrun-build [--dts] [--workspaces] [directories, files or globs pattern to build]',
      '  --no-cjs             : Does not generate cjs files',
      '  --no-mjs             : Does not generate mjs files',
      '  --baner-mjs=<banner> : Adds a baner to each compiled mjs file',
      '  --baner-cjs=<banner> : Adds a baner to each compiled cjs file',
      '  --dts                : Generates also .d.ts files (very slow).',
      '  --workspaces         : Looks for .ts files in project workspaces in package.json.',
      '  --clean              : Delete all compiled files (ignores all other options)'
    ]
    if (hasEmptyArgs) {
      messages.push('\nYou need to specify either --workspaces or patterns to build.')
    }
    console.error(messages.join('\n'), '\n')

    return false
  }

  console.time('esrun-build')

  let result = false

  try {
    const patterns = await getTsPatterns({ addWorkspaces, cwd, input: inputPatterns })

    const files = patterns && patterns.length && (await getTsFiles({ patterns, cwd }))
    if (!files || !files.length) {
      console.warn(clean ? 'esrun-build: No files to delete.' : 'esrun-build: No files to compile.')
      return true
    }

    if (clean) {
      console.info('esrun-build: Removing output of ', files.length, ' source files')
      const deletedFiles = await cleanOutputFiles({ files, cwd })
      console.info('esrun-build: Deleted', deletedFiles, 'files')
      return true
    }

    console.info('esrun-build: Compiling', files.length, 'files')

    const promises = []

    if (cjs || mjs) {
      promises.push(compileSourceFiles({ cjs, mjs, files, cwd, baner_mjs, baner_cjs }))
    }

    if (dts) {
      promises.push(compileDtsFiles({ files, cwd }))
    }

    result = (await Promise.all(promises)).every((x) => !!x)
  } finally {
    console.timeEnd('esrun-build')
  }

  return result
}

async function cleanOutputFiles({ files, cwd = process.cwd(), extensions = ['.d.ts', '.mjs', '.cjs'] }) {
  const promises = []
  let count = 0
  const incr = () => ++count
  const noop = () => undefined

  for (const file of files) {
    const f = path.resolve(cwd, path.dirname(file), path.basename(file, path.extname(file)))
    for (const ext of extensions) {
      promises.push(fs.promises.rm(`${f}${ext}`).then(incr).catch(noop))
    }
  }

  await Promise.all(promises)
  return count
}

async function compileSourceFiles({
  cjs = true,
  mjs = true,
  files,
  cwd = process.cwd(),
  baner_mjs = [],
  baner_cjs = []
}) {
  cwd = cwd ? path.resolve(cwd) : process.cwd()

  const esbuildPromises = []
  const target = [`node14`, 'chrome91']

  if (mjs) {
    esbuildPromises.push(
      esbuild.build({
        banner: {
          js: ['/* eslint-disable */ // prettier-ignore', ...baner_mjs].join('\n')
        },
        write: true,
        bundle: false,
        charset: 'utf8',
        format: 'esm',
        sourcemap: 'inline',
        sourcesContent: false,
        target,
        entryPoints: files,
        outdir: cwd,
        outbase: cwd,
        outExtension: { '.js': '.mjs' }
      })
    )
  }

  if (cjs) {
    esbuildPromises.push(
      esbuild.build({
        banner: {
          js: ['/* eslint-disable */ // prettier-ignore', "'use strict';", ...baner_cjs].join('\n')
        },
        write: true,
        bundle: false,
        charset: 'utf8',
        format: 'cjs',
        sourcemap: 'inline',
        sourcesContent: false,
        target,
        entryPoints: files,
        outdir: cwd,
        outbase: cwd,
        outExtension: { '.js': '.cjs' }
      })
    )
  }

  for (const item of await Promise.all(esbuildPromises)) {
    if (item.errors.length > 0) {
      return false
    }
  }

  return true
}

async function getWorkspaceDirectories(cwd) {
  const packageJson = await findPackageJson(cwd)
  if (packageJson && Array.isArray(packageJson.manifest.workspaces)) {
    const searcher = new SearchDirectories(packageJson.manifest.workspaces, true)
    if (searcher.hasSearchPatterns) {
      return fastglob(Array.from(searcher.patterns), {
        ignore: defaultIgnores,
        cwd: packageJson.dir,
        absolute: true,
        followSymbolicLinks: true,
        markDirectories: true,
        suppressErrors: true,
        onlyDirectories: true,
        unique: true
      })
    }
  }
  return []
}

async function findPackageJson(curentFolder) {
  let dir = curentFolder ? path.resolve(curentFolder) : process.cwd()
  dir = await fs.promises.realpath(dir)
  for (;;) {
    const found = path.join(dir, 'package.json')
    if (fs.existsSync(found)) {
      try {
        let content = await fs.promises.readFile(found, 'utf8')
        if (content.charCodeAt(0) === 0xfeff) {
          content = content.slice(1)
        }
        const manifest = JSON.parse(content)
        if (typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest)) {
          return { dir, manifest }
        }
      } catch (error) {
        if (error.code !== 'EISDIR') {
          throw error
        }
      }
    }
  }
}

if (require.main === module) {
  process.on('uncaughtException', errors.handleUncaughtError)
  esrunBuildMain()
    .then((result) => {
      if (!result && !process.exitCode) {
        process.exitCode = 1
      }
    })
    .catch(errors.emitUncaughtError)
}
