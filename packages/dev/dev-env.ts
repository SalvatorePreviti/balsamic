import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import util from "node:util";
import { fileURLToPath } from "node:url";
import type { InspectOptions as _InspectOptions } from "node:util";
import type { WriteStream } from "node:tty";

import { makePathRelative } from "./path/lib/make-path-relative";
import { _initialCwd } from "./main/_initial-cwd";

const private_isCI = Symbol("isCI");
const private_colorsLevel = Symbol("colorsLevel");
const private_stderrColorsLevel = Symbol("stderrColorsLevel");
const private_processTitle = Symbol("processTitle");
const private_defaultProcessTitle = Symbol("defaultProcessTitle");
const private_env = Symbol("env");

export let devEnv: DevEnv;

/** Returns true if running inside continuous integration pipeline */
export function isCI(): boolean {
  return devEnv.isCI;
}

export class DevEnv {
  public initialCwd: string = _initialCwd;

  private [private_env]: NodeJS.ProcessEnv | undefined = undefined;
  private [private_isCI]: boolean | undefined = undefined;
  private [private_colorsLevel]: 0 | 1 | 2 | 3 | undefined = undefined;
  private [private_stderrColorsLevel]: 0 | 1 | 2 | 3 | undefined = undefined;
  private [private_processTitle]: string | undefined = undefined;
  private [private_defaultProcessTitle]: string | undefined = undefined;

  public readonly inspectOptions = new DevEnv.InspectOptions();

  public constructor(env: NodeJS.ProcessEnv) {
    this[private_env] = env;
  }

  public static get instance(): DevEnv {
    return devEnv;
  }

  public static set instance(value: DevEnv) {
    devEnv = value;
  }

  public get env(): NodeJS.ProcessEnv {
    return this[private_env] ?? process.env;
  }

  public set env(value: NodeJS.ProcessEnv | undefined) {
    this[private_env] = value;
  }

  public get isCI(): boolean {
    let result = this[private_isCI];
    if (result === undefined) {
      result =
        (!!this.env.CI && this.env.CI !== "false") || this.env.TF_BUILD === "True" || process.argv.includes("--ci");
      this[private_isCI] = result;
    }
    return result;
  }

  public set isCI(value: boolean) {
    this[private_isCI] = !!value;
  }

  public get colorsLevel(): 0 | 1 | 2 | 3 {
    let result = this[private_colorsLevel];
    if (result === undefined) {
      result = _loadHasColors(process.stdout);
      this[private_colorsLevel] = result;
    }
    return result;
  }

  public set colorsLevel(value: number | boolean | string | null) {
    if (typeof value === "string") {
      value = Number.parseInt(value);
    }
    this[private_colorsLevel] = !value
      ? 0
      : value === true
      ? 1
      : ((value > 0 ? (value < 3 ? value | 0 : 3) : 0) as 1 | 2 | 3);
  }

  public get stderrColorsLevel(): 0 | 1 | 2 | 3 {
    let result = this[private_stderrColorsLevel];
    if (result === undefined) {
      result = _loadHasColors(process.stderr);
      this[private_stderrColorsLevel] = result;
    }
    return result;
  }

  public set stderrColorsLevel(value: number | boolean | string | null) {
    if (typeof value === "string") {
      value = Number.parseInt(value);
    }
    this[private_stderrColorsLevel] = !value
      ? 0
      : value === true
      ? 1
      : ((value > 0 ? (value < 3 ? value | 0 : 3) : 0) as 1 | 2 | 3);
  }

  public get processTitle(): string {
    let result = this[private_processTitle];
    if (result === undefined) {
      result = this[private_defaultProcessTitle];
      if (result === undefined) {
        result = _extrapolateProcessTitle(process.mainModule || process.argv[1]) || "script";
        this[private_defaultProcessTitle] = result;
        return result;
      }
    }
    return result;
  }

  public set processTitle(
    title:
      | string
      | {
          readonly filename?: string | undefined;
          readonly id?: string | undefined;
          readonly path?: string | undefined;
        },
  ) {
    this[private_processTitle] = _extrapolateProcessTitle(title);
  }

  public get hasProcessTitle(): boolean {
    return this[private_processTitle] !== undefined;
  }

  public [util.inspect.custom](): string {
    return this.constructor.name;
  }

  /** Loads .env file */
  public loadDotEnv(dotenvPath?: string | boolean | undefined): boolean {
    try {
      if (dotenvPath === false) {
        return false;
      }

      const REGEX_NEWLINE = "\n";
      const REGEX_NEWLINES = /\\n/g;
      const REGEX_NEWLINES_MATCH = /\r\n|\n|\r/;
      const REGEX_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;

      dotenvPath = (typeof dotenvPath === "string" ? dotenvPath : this.env.DOTENV_CONFIG_PATH) || path.resolve(".env");
      dotenvPath = dotenvPath.startsWith("~")
        ? path.resolve(
            os.homedir(),
            dotenvPath.slice(dotenvPath.startsWith("/") || dotenvPath.startsWith("\\") ? 2 : 1),
          )
        : dotenvPath;

      for (const line of fs.readFileSync(dotenvPath, "utf8").split(REGEX_NEWLINES_MATCH)) {
        const keyValueArr = REGEX_INI_KEY_VAL.exec(line);
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
          if (!Object.prototype.hasOwnProperty.call(this.env, key)) {
            this.env[key] = val;
          }
        }
      }
      return true;
    } catch (_e) {
      // Do nothing
    }
    return false;
  }
}

export namespace DevEnv {
  export class InspectOptions implements _InspectOptions {
    public sorted: boolean = false;
    public getters: boolean = false;
    public showHidden: boolean = false;
    public customInspect: boolean = true;
    public colors_forced: boolean | undefined;
    public depth: number | undefined = Math.max(6, util.inspect.defaultOptions.depth || 0);
    public colors?: boolean | undefined;
  }
}

devEnv = new DevEnv(process.env);

function _extrapolateProcessTitle(
  value:
    | string
    | { filename?: string | undefined; id?: string | undefined; path?: string | undefined }
    | null
    | undefined,
): string | undefined {
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

function _loadHasColors(stream: WriteStream): 0 | 1 | 2 | 3 {
  if (process.argv.includes("--no-color") || process.argv.includes("--no-colors")) {
    return 0;
  }

  if (process.env.NO_COLOR || process.env.FORCE_COLOR === "0") {
    return 0;
  }

  if (stream && typeof stream.hasColors === "function") {
    const level = stream.hasColors(2 ** 24) ? 3 : stream.hasColors(2 ** 8) ? 2 : stream.hasColors() ? 1 : 0;
    if (level) {
      return level;
    }
  }

  return isCI() ? 1 : 0;
}
