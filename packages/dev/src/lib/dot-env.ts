import path from 'path'
import fs from 'fs'
import os from 'os'

/** Loads .env file */
export function loadDotEnv(dotenvPath?: string | boolean): boolean {
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
