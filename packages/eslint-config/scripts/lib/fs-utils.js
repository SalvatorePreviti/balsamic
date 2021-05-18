/* eslint-disable global-require */

'use strict'

const fs = require('fs')
const path = require('path')
const logging = require('./logging')
const { sortPackageJson } = require('eslint-plugin-quick-prettier/json-utils.js')
const { spawn } = require('child_process')

const projectRoot = path.dirname(require.resolve('../../package.json'))

function beforeCreateFile(targetPath) {
  if (Array.isArray(targetPath)) {
    for (const item of targetPath) {
      if (fs.existsSync(path.resolve(`./${item}`))) {
        logging.skip(`skiping existing file ${item}`)
        return false
      }
      logging.progress(`creating ${item}...`)
    }
    return path.resolve(targetPath[0])
  }
  const resolved = path.resolve(targetPath)
  if (fs.existsSync(resolved)) {
    logging.skip(`skiping existing file ${targetPath}`)
    return false
  }
  logging.progress(`creating ${targetPath}...`)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  return resolved
}

function copyProjectFile(sourcePath, targetPath = sourcePath) {
  targetPath = beforeCreateFile(targetPath)
  if (targetPath) {
    fs.copyFileSync(path.join(projectRoot, sourcePath), targetPath)
  }
}

function createProjectFile(targetPath, content) {
  targetPath = beforeCreateFile(targetPath)
  if (targetPath) {
    fs.writeFileSync(targetPath, content)
  }
}

function loadPackageJson(packageJsonPath) {
  try {
    return JSON.parse(cleanupText(fs.readFileSync(packageJsonPath, 'utf8')))
  } catch (e) {
    e.showStack = false
    throw e
  }
}

function rewritePackageJson(packageJsonPath, project) {
  const stringified = JSON.stringify(sortPackageJson(project), null, 2)
  let originalManifest
  try {
    originalManifest = fs.readFileSync(packageJsonPath, 'utf8')
  } catch (_) {}
  let formatted
  try {
    const prettierInterface = require('eslint-plugin-quick-prettier/prettier-interface')
    formatted = prettierInterface.format(stringified, { ignoreErrors: true, parser: 'json-stringify' })
  } catch (_) {}
  formatted = cleanupText(formatted || stringified)
  if (formatted !== originalManifest) {
    logging.progress('rewriting package.json ...')
    fs.writeFileSync(packageJsonPath, formatted)
  } else {
    logging.skip('package.json unchanged')
  }
}

function cleanupText(text) {
  if (typeof text !== 'string') {
    if (text === undefined || text === null) {
      return ''
    }
    text = Buffer.isBuffer(text) ? text.toString() : JSON.stringify(text, null, 2)
  }
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  text = text.replace(/[\r\n]/gm, '\n')
  if (text.length !== 0 && !text.endsWith('\n')) {
    text += '\n'
  }
  return text
}

function findDirectoryInParents(filename) {
  let dir = process.cwd()
  if (dir.indexOf('node_modules') > 0) {
    dir = fs.realPathSync(dir)
  }
  for (;;) {
    const found = path.join(dir, filename)
    if (isDirectory(found)) {
      return found
    }
    const parent = path.dirname(dir)
    if (dir.length <= parent.length) {
      return ''
    }
    dir = parent
  }
}

function isDirectory(filename) {
  try {
    const stats = fs.statSync(filename)
    return stats.isDirectory()
  } catch (_) {}
  return false
}

async function runAsync(command, args = [], options) {
  if (!Array.isArray(args)) {
    args = [args]
  }
  await new Promise((resolve, reject) => {
    const opt = {
      stdio: 'inherit',
      ...options
    }

    const outputToString = opt.stdio === 'string'
    if (outputToString) {
      delete opt.stdio
    }

    let result
    const child = spawn(command, args, opt)
    child
      .on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`))
        } else {
          resolve(result)
        }
      })
      .on('error', (error) => {
        reject(error || new Error(`${command} failed`))
      })
      .on('data', (d) => {
        result += d
      })
  })
}

function getPackageManager(cwd = process.cwd()) {
  let yarnDate = 0
  let packageLockDate = 0
  try {
    const stats = fs.statSync(path.resolve(cwd, 'yarn.lock'))
    yarnDate = stats.isFile() && stats.mtimeMs
  } catch (_error) {}
  try {
    const stats = fs.statSync(path.resolve(cwd, 'package-lock.json'))
    packageLockDate = stats.isFile() && stats.mtimeMs
  } catch (_error) {}

  if (packageLockDate > yarnDate) {
    return 'npm'
  }

  if (yarnDate > packageLockDate) {
    return 'yarn'
  }

  return undefined
}

module.exports = {
  beforeCreateFile,
  copyProjectFile,
  createProjectFile,
  loadPackageJson,
  rewritePackageJson,
  findDirectoryInParents,
  cleanupText,
  runAsync,
  getPackageManager
}
