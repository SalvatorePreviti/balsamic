import _path from "path";

export const WIN32_SEP_REGEX = /(?:[\\/]+\.)*[\\/]+/g;

export const NULL_CHAR_REGEX = /\0/g;

const { isArray } = Array;

const UNC_PATH_REGEX = /^[\\/]{2,}[^\\/]+[\\/]+[^\\/]+/;
const GLOB_IS_REGEX = /\\(.)|(^!|\*|\?|[\].+)]\?|\[[^\\\]]+\]|\{[^\\}]+\}|\(\?[:!=][^\\)]+\)|\([^|]+\|[^\\)]+\))/;
const GLOB_MATCHING_CHARS: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
const LOOKS_LIKE_FILE_URL_REGEX = /^file:\/\//i;
const INVALID_PACKAGE_NAME_REGEX = /^\.|%|\\/;

/** Checks if the given path is a win32 UNC path. */
export const isUNCPath = (win32Path: string): boolean => UNC_PATH_REGEX.test(win32Path);

/** Test whether the given string looks like a glob */
export const isGlob = (glob: string): boolean => {
  for (;;) {
    const match = GLOB_IS_REGEX.exec(glob);
    if (!match) {
      break;
    }
    if (match[2]) {
      return true;
    }
    let i = match.index + match[0].length;
    const open = match[1];
    const close = open ? GLOB_MATCHING_CHARS[open] : null;
    if (open && close) {
      const n = glob.indexOf(close, i);
      if (n !== -1) {
        i = n + 1;
      }
    }
    glob = glob.slice(i);
  }
  return false;
};

/** Returns true if the given path starts with file:// */
export const looksLikeFileURL = (path: string): path is `file://${string}` => LOOKS_LIKE_FILE_URL_REGEX.test(path);

export interface NodePackageName {
  packageScope: string;
  packageName: string;
  subpath: string;
}

/** Parses a node package path. Example hello/subpath */
export const parseNodePackageName = (specifier: string): NodePackageName | null => {
  const first = specifier.charCodeAt(0);
  if (!first) {
    return null;
  }
  let slashIndex = specifier.indexOf("/");
  let packageScope = "";
  if (first === 64) {
    if (slashIndex < 0) {
      return null;
    }
    packageScope = specifier.slice(0, slashIndex);
    if (packageScope.length < 1) {
      return null;
    }
    slashIndex = specifier.indexOf("/", slashIndex + 1);
  }
  const packageName = slashIndex === -1 ? specifier : specifier.slice(0, slashIndex);
  if (!packageName || INVALID_PACKAGE_NAME_REGEX.exec(packageName) !== null) {
    return null;
  }
  return {
    packageScope,
    packageName,
    subpath: slashIndex < 0 ? "." : _path.posix.normalize(`.${specifier.slice(slashIndex)}`),
  };
};

export const _simpleJoin = (
  parts: ((string | number | false | null | undefined)[] | string | number | false | null | undefined)[],
) => {
  let result = "";
  for (let i = 0, len = parts.length; i < len; ++i) {
    const path = parts[i];
    if (path !== null && path !== undefined && path !== false) {
      if (isArray(path)) {
        for (let j = 0, jlen = path.length; j < jlen; ++j) {
          const jpath = path[j];
          if (jpath !== null && jpath !== undefined && jpath !== false) {
            if (result) {
              result += "/";
            }
            result += jpath;
          }
        }
      } else {
        if (result) {
          result += "/";
        }
        result += path;
      }
    }
  }
  return result;
};

const WHITESPACE_ENCODINGS: Record<string, string> = {
  "\u0009": "%09",
  "\u000A": "%0A",
  "\u000B": "%0B",
  "\u000C": "%0C",
  "\u000D": "%0D",
  "\u0020": "%20",
};

const _encodeWhitespaceChar = (c: string) => WHITESPACE_ENCODINGS[c] || c;

export const _encodeWhitespace = (s: string): string => s.replace(/[\s]/g, _encodeWhitespaceChar);
