import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { makePathRelative } from '../path'

let _isCI: boolean =
  (!!process.env.CI && process.env.CI !== 'false') || process.env.TF_BUILD === 'True' || process.argv.includes('--ci')

/** Returns true if running inside continuous integration pipeline */
export function isCI() {
  return _isCI
}

/** Changes the value of isCI */
isCI.set = function setIsCI(value: boolean) {
  value = !!value
  if (_isCI !== value) {
    _isCI = !!value
    if (value) {
      process.env.CI = '1'
    } else {
      delete process.env.CI
    }
  }
}

let supporrtsColorLevel: 0 | 1 | 2 | 3 | undefined

function loadHasColors(): 0 | 1 | 2 | 3 {
  if (process.argv.includes('--no-color') || process.argv.includes('--no-colors')) {
    return 0
  }

  if (process.env.NO_COLOR || process.env.FORCE_COLOR === '0') {
    return 0
  }

  const stdout = process.stdout

  if (stdout && typeof stdout.hasColors === 'function') {
    const level = stdout.hasColors(2 ** 24) ? 3 : stdout.hasColors(2 ** 8) ? 2 : stdout.hasColors() ? 1 : 0
    if (level) {
      return level
    }
  }

  return isCI() ? 1 : 0
}

function hasColors(): 0 | 1 | 2 | 3 {
  return supporrtsColorLevel !== undefined ? supporrtsColorLevel : (supporrtsColorLevel = loadHasColors())
}

hasColors.set = (value: number | boolean) => {
  supporrtsColorLevel = !value ? 0 : value === true ? 1 : ((value > 0 ? (value < 3 ? value | 0 : 3) : 0) as 1 | 2 | 3)
}

/** Loads .env file */
function loadDotEnv(dotenvPath?: string | boolean): boolean {
  try {
    if (dotenvPath === false) {
      return false
    }

    const REGEX_NEWLINE = '\n'
    const REGEX_NEWLINES = /\\n/g
    const REGEX_NEWLINES_MATCH = /\r\n|\n|\r/
    const REGEX_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/

    dotenvPath = (typeof dotenvPath === 'string' ? dotenvPath : process.env.DOTENV_CONFIG_PATH) || path.resolve('.env')
    dotenvPath = dotenvPath.startsWith('~')
      ? path.resolve(os.homedir(), dotenvPath.slice(dotenvPath.startsWith('/') || dotenvPath.startsWith('\\') ? 2 : 1))
      : dotenvPath

    for (const line of fs.readFileSync(dotenvPath, 'utf8').split(REGEX_NEWLINES_MATCH)) {
      const keyValueArr = line.match(REGEX_INI_KEY_VAL)
      if (keyValueArr !== null) {
        const key = keyValueArr[1]
        let val = (keyValueArr[2] || '').trim()
        const singleQuoted = val.startsWith("'") && val.endsWith("'")
        const doubleQuoted = val.startsWith('"') && val.endsWith('"')
        if (singleQuoted || doubleQuoted) {
          val = val.substring(1, val.length - 1)
          if (doubleQuoted) {
            val = val.replace(REGEX_NEWLINES, REGEX_NEWLINE)
          }
        }
        if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
          process.env[key] = val
        }
      }
    }
    return true
  } catch (_e) {
    // Do nothing
  }
  return false
}

let _processTitle: string | undefined
let _defaultProcessTitle: string | undefined

function getProcessTitle() {
  if (_processTitle === undefined) {
    return _defaultProcessTitle !== undefined
      ? _defaultProcessTitle
      : (_defaultProcessTitle = _extrapolateProcessTitle(process.mainModule || process.argv[1]) || 'script')
  }
  return _processTitle
}

const setProcessTitle = (value: string | { filename?: string; id?: string; path?: string }) => {
  _processTitle = _extrapolateProcessTitle(value)
}

export const devEnv = {
  initialCwd: process.cwd(),
  hasColors,
  isCI,
  loadDotEnv,
  getProcessTitle,
  setProcessTitle
}

getProcessTitle.hasProcessTitle = function hasProcessTitle() {
  return !!_processTitle
}

getProcessTitle.set = function _setProcessTitle(value: string | { filename?: string; id?: string; path?: string }) {
  devEnv.setProcessTitle(value)
}

function _extrapolateProcessTitle(
  value: string | { filename?: string; id?: string; path?: string } | null | undefined
) {
  if (typeof value === 'object' && value !== null) {
    let fname = value.filename
    if (typeof fname !== 'string' || !fname) {
      fname = value.path
      if (typeof fname !== 'string' || !fname) {
        fname = value.id
      }
    }
    if (fname) {
      value = fname
    }
  }
  if (typeof value !== 'string' || !value || value === '.' || value === './') {
    return undefined
  }
  if (/^file:\/\//i.test(value)) {
    value = fileURLToPath(value)
  }
  if (value.startsWith('/')) {
    value = makePathRelative(value, devEnv.initialCwd) || value
  }
  return value
}
