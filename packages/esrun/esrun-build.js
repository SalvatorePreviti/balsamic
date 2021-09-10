#!/usr/bin/env node
'use strict'

const path = require('path')
const fs = require('fs')
const fastglob = require('fast-glob')
const esbuild = require('esbuild')
const dev = require('./dev.js')

const defaultIgnores = ['**/node_modules/**', '**/.*/**', '**/*.d.ts']

module.exports = {
  getWorkspaceDirectories,
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

async function getTsPatterns({ workspaceDirectories, input = [], cwd = process.cwd() }) {
  const inputPatterns = new SearchDirectories(input, false)
  if (workspaceDirectories === true) {
    workspaceDirectories = await exports.getWorkspaceDirectories(cwd)
  }
  if (workspaceDirectories && workspaceDirectories.length) {
    inputPatterns.add(workspaceDirectories)
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

async function compileDtsFiles({ files, cwd, outdir, outbase }) {
  cwd = cwd ? path.resolve(cwd) : process.cwd()
  const { Worker } = require('worker_threads')
  const worker = new Worker(path.resolve(__dirname, './lib/dts-builder-thread.js'), {
    workerData: { files, cwd, outdir, outbase }
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

async function esrunBuildMain(args = process.argv.slice(2), cwd = process.cwd(), isMain = true) {
  let timing = false
  try {
    if (isMain) {
      process.on('uncaughtException', dev.handleUncaughtError)
    }

    let addWorkspaces = false
    let help = false
    let hasInvalidArg = false
    let cjs = true
    let mjs = true
    let dts = false
    let clean = false
    let outdir
    let outdirPending = false
    let sourcemap
    const baner_cjs = []
    const baner_mjs = []
    const inputPatterns = []
    for (const arg of args) {
      if (outdirPending) {
        outdirPending = false
        outdir = arg
        continue
      }
      if (arg === '--build' || arg === '--time') {
        // Do nothing
      } else if (arg.startsWith('--banner-mjs=')) {
        baner_mjs.push(arg.slice('--banner-mjs='.length))
      } else if (arg.startsWith('--banner-cjs=')) {
        baner_cjs.push(arg.slice('--banner-cjs='.length))
      } else if (arg === '--dts') {
        dts = true
      } else if (arg === '--outdir') {
        outdirPending = true
      } else if (arg.startsWith('--outdir=')) {
        outdir = arg.slice('--outdir='.length)
      } else if (arg === '--no-dts') {
        dts = false
      } else if (arg === '--sourcemap=false' || arg === '--no-sourcemap') {
        sourcemap = false
      } else if (arg === '--sourcemap=inline') {
        sourcemap = 'inline'
      } else if (arg === '--sourcemap=external') {
        sourcemap = 'external'
      } else if (arg === '--sourcemap=both') {
        sourcemap = 'both'
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

    const hasEmptyArgs = !addWorkspaces && !inputPatterns.length && !outdirPending
    if (help || hasInvalidArg || hasEmptyArgs || outdirPending) {
      require('./lib/esrun-main-help').printHelp()
      if (hasEmptyArgs) {
        console.error('You need to specify either --workspaces or patterns to build.\n')
      }

      return false
    }

    const workspaceDirectories = addWorkspaces ? await getWorkspaceDirectories(cwd) : []

    console.time('esrun-build')
    timing = true

    let result = false

    const patterns = await getTsPatterns({ workspaceDirectories, cwd, input: inputPatterns })

    const files = patterns && patterns.length && (await getTsFiles({ patterns, cwd }))

    if (!files || !files.length) {
      console.warn(clean ? 'esrun-build: No files to delete.' : 'esrun-build: No files to compile.')
      return true
    }

    const entries = groupFilesByWorkspace({ workspaceDirectories, files, outdir, cwd })

    if (clean) {
      console.info('esrun-build: Removing output of ', files.length, ' source files')
      let deletedFiles = 0
      for (const entry of entries) {
        deletedFiles += await cleanOutputFiles({
          cwd,
          files: entry.files,
          outdir: entry.outdir,
          extensions: outdir && outdir !== cwd ? ['.d.ts', '.mjs', '.cjs', '.js'] : ['.d.ts', '.mjs', '.cjs']
        })
      }
      console.info('esrun-build: Deleted', deletedFiles, 'files')
      return true
    }

    console.info('esrun-build: Compiling', files.length, 'files')

    const promises = []

    for (const entry of entries) {
      if (cjs || mjs) {
        promises.push(
          compileSourceFiles({
            cwd,
            files: entry.files,
            outbase: entry.outbase,
            outdir: entry.outdir,
            cjs,
            mjs,
            sourcemap,
            baner_mjs,
            baner_cjs
          })
        )
      }

      if (dts) {
        promises.push(
          compileDtsFiles({
            cwd,
            files: entry.files,
            outbase: entry.outbase,
            outdir: entry.outdir
          })
        )
      }
    }

    result = (await Promise.all(promises)).every((x) => !!x)

    if (isMain && !result && !process.exitCode) {
      process.exitCode = 1
    }

    return result
  } catch (error) {
    if (isMain) {
      dev.emitUncaughtError(error)
    } else {
      throw error
    }
  } finally {
    if (timing) {
      console.timeEnd('esrun-build')
    }
  }

  return false
}

async function cleanOutputFiles({ files, cwd = process.cwd(), outdir, extensions }) {
  if (!outdir) {
    outdir = cwd
  }

  const promises = []
  let count = 0
  const incr = () => ++count
  const noop = () => undefined

  for (const file of files) {
    const f = path.resolve(outdir, path.dirname(file), path.basename(file, path.extname(file)))
    for (const ext of extensions) {
      promises.push(fs.promises.rm(`${f}${ext}`).then(incr).catch(noop))
    }
  }

  if (outdir !== cwd) {
    promises.push(cleanEmptyFoldersRecursively(outdir, promises))
  }

  await Promise.all(promises)
  return count
}

async function cleanEmptyFoldersRecursively(folder, promises) {
  try {
    const files = await fs.promises.readdir(folder)
    if (files.length > 0) {
      for (const file of files) {
        promises.push(cleanEmptyFoldersRecursively(path.resolve(folder, file)))
      }

      promises.push(
        fs.promises
          .readdir(folder)
          .then((f) => (f.length === 0 ? fs.promises.rmdir(folder).catch(() => {}) : undefined))
      )
    }
  } catch (_e) {
    // do nothing
  }
}

function groupFilesByWorkspace({ workspaceDirectories, files, outdir, cwd }) {
  const result = new Map()
  const add = (basedir, baseDirectory, outDirectory, file) => {
    let entry = result.get(outDirectory)
    if (!entry) {
      entry = {
        basedir,
        outbase: baseDirectory,
        outdir: outDirectory,
        files: []
      }
      result.set(outDirectory, entry)
    }
    entry.files.push(file)
  }

  if (!outdir) {
    return [
      {
        outbase: cwd,
        outdir: undefined,
        files
      }
    ]
  }

  if (outdir.startsWith('./') || outdir.startsWith('.\\') || outdir.startsWith('../') || outdir.startsWith('..\\')) {
    outdir = path.resolve(outdir)
  }

  if (path.isAbsolute(outdir)) {
    for (const file of files) {
      add(cwd, cwd, path.resolve(cwd, outdir), file)
    }
  } else {
    for (const file of files) {
      let found = false
      for (const workspaceDirectory of workspaceDirectories) {
        if (file.startsWith(workspaceDirectory)) {
          add(
            workspaceDirectory,
            file.slice(workspaceDirectory.length).startsWith(`src${path.sep}`)
              ? path.join(workspaceDirectory, 'src')
              : undefined,
            path.resolve(workspaceDirectory, outdir),
            file
          )
          found = true
          break
        }
      }
      if (!found) {
        add(cwd, cwd, outdir, file)
      }
    }
  }

  const entries = Array.from(result.values())
  for (const entry of entries) {
    if (!entry.outbase) {
      entry.outbase = commonPathPrefix(entry.files) || entry.basedir
    }
  }
  return entries
}

async function compileSourceFiles({
  cwd,
  outdir,
  outbase,
  cjs = true,
  mjs = true,
  sourcemap = 'external',
  files,
  baner_mjs = [],
  baner_cjs = []
}) {
  if (!outdir) {
    outdir = cwd
  }
  const esbuildPromises = []
  const target = [`node16`, 'chrome93']

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
        allowOverwrite: false,
        sourcemap,
        sourcesContent: false,
        target,
        entryPoints: files,
        outdir,
        outbase,
        publicPath: cwd,
        outExtension: { '.js': !cjs && outdir !== cwd ? '.js' : '.mjs' }
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
        allowOverwrite: false,
        sourcemap,
        sourcesContent: false,
        target,
        entryPoints: files,
        outdir,
        outbase,
        publicPath: cwd,
        outExtension: { '.js': !mjs && outdir !== cwd ? '.js' : '.cjs' }
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

function commonPathPrefix(paths) {
  const [first = '', ...remaining] = paths
  if (remaining.length === 0) {
    return path.dirname(first)
  }

  const sep = path.sep
  const parts = first.split(sep)

  let endOfPrefix = parts.length
  for (const p of remaining) {
    const compare = p.split(p.sep)
    for (let i = 0; i < endOfPrefix; i++) {
      if (compare[i] !== parts[i]) {
        endOfPrefix = i
      }
    }
    if (!endOfPrefix) {
      return ''
    }
  }

  const prefix = parts.slice(0, endOfPrefix).join(sep)
  return prefix.endsWith(sep) ? prefix : prefix + sep
}

if (require.main === module) {
  esrunBuildMain()
}
