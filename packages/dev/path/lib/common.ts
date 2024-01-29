export const WIN32_SEP_REGEX = /(?:[\\/]+\.)*[\\/]+/g;

export const NULL_CHAR_REGEX = /\0/g;

const { isArray } = Array;

const GLOB_MATCHING_CHARS: Record<string, string> = { "{": "}", "(": ")", "[": "]" };

/** Checks if the given path is a win32 UNC path. */
export const isUNCPath = (win32Path: string): boolean => /^[\\/]{2,}[^\\/]+[\\/]+[^\\/]+/.test(win32Path);

/** Test whether the given string looks like a glob */
export const isGlob = (glob: string): boolean => {
  for (;;) {
    const match = /\\(.)|(^!|\*|\?|[\].+)]\?|\[[^\\\]]+\]|\{[^\\}]+\}|\(\?[:!=][^\\)]+\)|\([^|]+\|[^\\)]+\))/.exec(
      glob,
    );
    if (!match || !match.length) {
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
export const looksLikeFileURL = (path: string): path is `file://${string}` => /^file:\/\//i.test(path);

export interface NodePackageName {
  packageScope: string;
  packageName: string;
  subpath: string;
}

export const _simpleJoin = (
  parts: ((string | number | false | null | undefined)[] | string | number | false | null | undefined)[],
): string => {
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

const _encodeWhitespaceChar = (c: string): string => WHITESPACE_ENCODINGS[c] || c;

export const _encodeWhitespace = (s: string): string => s.replace(/[\s]/g, _encodeWhitespaceChar);
