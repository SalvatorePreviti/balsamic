import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { makePathRelative } from "../path";

/** Returns true if running inside continuous integration pipeline */
export const isCI = () => {
  return isCI.value;
};

isCI.value =
  (!!process.env.CI && process.env.CI !== "false") || process.env.TF_BUILD === "True" || process.argv.includes("--ci");

let _supportsColorLevel: 0 | 1 | 2 | 3 | undefined;
let _processTitle: string | undefined;
let _defaultProcessTitle: string | undefined;

export const devEnv = {
  initialCwd: process.cwd(),

  isCI,

  /** Changes the value of isCI */
  setIsCI(value: boolean) {
    value = !!value;
    if (isCI.value !== value) {
      isCI.value = !!value;
      if (value) {
        process.env.CI = "1";
      } else {
        delete process.env.CI;
      }
    }
  },

  hasColors(): 0 | 1 | 2 | 3 {
    return _supportsColorLevel !== undefined ? _supportsColorLevel : (_supportsColorLevel = loadHasColors());
  },

  setHasColors(value: number | boolean): void {
    _supportsColorLevel = !value
      ? 0
      : value === true
      ? 1
      : ((value > 0 ? (value < 3 ? value | 0 : 3) : 0) as 1 | 2 | 3);
  },

  getProcessTitle() {
    if (_processTitle === undefined) {
      return _defaultProcessTitle !== undefined
        ? _defaultProcessTitle
        : (_defaultProcessTitle = _extrapolateProcessTitle(process.mainModule || process.argv[1]) || "script");
    }
    return _processTitle;
  },

  setProcessTitle(
    value: string | { filename?: string | undefined; id?: string | undefined; path?: string | undefined },
  ) {
    _processTitle = _extrapolateProcessTitle(value);
  },

  hasProcessTitle() {
    return !!_processTitle;
  },

  /** Loads .env file */
  loadDotEnv(dotenvPath?: string | boolean | undefined): boolean {
    try {
      if (dotenvPath === false) {
        return false;
      }

      const REGEX_NEWLINE = "\n";
      const REGEX_NEWLINES = /\\n/g;
      const REGEX_NEWLINES_MATCH = /\r\n|\n|\r/;
      const REGEX_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;

      dotenvPath =
        (typeof dotenvPath === "string" ? dotenvPath : process.env.DOTENV_CONFIG_PATH) || path.resolve(".env");
      dotenvPath = dotenvPath.startsWith("~")
        ? path.resolve(
            os.homedir(),
            dotenvPath.slice(dotenvPath.startsWith("/") || dotenvPath.startsWith("\\") ? 2 : 1),
          )
        : dotenvPath;

      for (const line of fs.readFileSync(dotenvPath, "utf8").split(REGEX_NEWLINES_MATCH)) {
        const keyValueArr = line.match(REGEX_INI_KEY_VAL);
        if (keyValueArr !== null) {
          const key = keyValueArr[1]!;
          let val = (keyValueArr[2] || "").trim();
          const singleQuoted = val.startsWith("'") && val.endsWith("'");
          const doubleQuoted = val.startsWith('"') && val.endsWith('"');
          if (singleQuoted || doubleQuoted) {
            val = val.substring(1, val.length - 1);
            if (doubleQuoted) {
              val = val.replace(REGEX_NEWLINES, REGEX_NEWLINE);
            }
          }
          if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
            process.env[key] = val;
          }
        }
      }
      return true;
    } catch (_e) {
      // Do nothing
    }
    return false;
  },
};

function _extrapolateProcessTitle(
  value:
    | string
    | { filename?: string | undefined; id?: string | undefined; path?: string | undefined }
    | null
    | undefined,
) {
  if (typeof value === "object" && value !== null) {
    let fname = value.filename;
    if (typeof fname !== "string" || !fname) {
      fname = value.path;
      if (typeof fname !== "string" || !fname) {
        fname = value.id;
      }
    }
    if (fname) {
      value = fname;
    }
  }
  if (typeof value !== "string" || !value || value === "." || value === "./") {
    return undefined;
  }
  if (/^file:\/\//i.test(value)) {
    value = fileURLToPath(value);
  }
  if (value.startsWith("/")) {
    value = makePathRelative(value, devEnv.initialCwd) || value;
  }
  return value;
}

function loadHasColors(): 0 | 1 | 2 | 3 {
  if (process.argv.includes("--no-color") || process.argv.includes("--no-colors")) {
    return 0;
  }

  if (process.env.NO_COLOR || process.env.FORCE_COLOR === "0") {
    return 0;
  }

  const stdout = process.stdout;

  if (stdout && typeof stdout.hasColors === "function") {
    const level = stdout.hasColors(2 ** 24) ? 3 : stdout.hasColors(2 ** 8) ? 2 : stdout.hasColors() ? 1 : 0;
    if (level) {
      return level;
    }
  }

  return isCI() ? 1 : 0;
}
