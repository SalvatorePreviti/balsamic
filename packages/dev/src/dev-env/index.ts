import path from 'path'
import fs from 'fs'
import os from 'os'
import tty from 'tty'
import { fileURLToPath } from 'url'
import { makePathRelative } from '../path'

let _isCI: boolean =
  (!!process.env.CI && process.env.CI !== 'false') || process.env.TF_BUILD === 'True' || process.argv.includes('--ci')

/** Returns true if running inside continuous integration pipeline */
export function isCI() {
  return _isCI
}

/** Changes the value of isCI */
isCI.set = (value: boolean) => {
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

let _colorForcedLoaded = false
let _noColorForced = false
let _colorForced = false
let _supportsBasicColors: boolean | undefined

function supportsBasicColors() {
  if (!_colorForcedLoaded) {
    _colorForcedLoaded = true
    if ('NO_COLOR' in process.env || process.argv.includes('--no-color')) {
      _noColorForced = true
    } else {
      _colorForced =
        'FORCE_COLOR' in process.env || process.argv.includes('--color') || process.argv.includes('--colors')
    }
  }

  if (_noColorForced) {
    return false
  }

  if (_colorForced) {
    return true
  }

  if (_supportsBasicColors === undefined) {
    _supportsBasicColors = process.platform === 'win32' || (tty.isatty(1) && process.env.TERM !== 'dumb')
  }

  return _supportsBasicColors || isCI()
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

const getProcessTitle = () => {
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
  isCI,
  supportsBasicColors,
  loadDotEnv,
  getProcessTitle,
  setProcessTitle
}

getProcessTitle.hasProcessTitle = () => !!_processTitle
getProcessTitle.set = (value: string | { filename?: string; id?: string; path?: string }) =>
  devEnv.setProcessTitle(value)

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
