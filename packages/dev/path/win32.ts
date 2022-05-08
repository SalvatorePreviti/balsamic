import _nodePath from "path";
import type { UnsafeAny } from "../types";

import {
  WIN32_SEP_REGEX,
  isUNCPath,
  isGlob,
  looksLikeFileURL,
  NULL_CHAR_REGEX,
  _simpleJoin,
  _encodeWhitespace,
} from "./lib/common";

export { isUNCPath, isGlob, looksLikeFileURL };

export type ParsedPath = _nodePath.ParsedPath;

export type FormatInputPathObject = _nodePath.FormatInputPathObject;

const WIN32_TRAIL_SEP_REGEX = /(?:[\\/]+\.)*[\\/]+\.?$/g;
const GLOB_PARENT_REGEX = /(?<=((?:[\\/]+\.)*[\\/]+|^)\*\*(?:[\\/]+\.)*[\\/]+)\.\.(?=(?:[\\/]+\.)*[\\/]+|$)/g;
const WIN32_TO_URL_SPLIT_REGEX = /^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/;
const ABSOLUTE_OR_RELATIVE_PATH_REGEX = /^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/;
const ROOT_PATH_REGEX = /^([a-zA-Z]:|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)?([\\/])?/;

export const {
  basename,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  toNamespacedPath,
} = _nodePath.win32;

/** Win32 path separator '\\' */
export const sep = "\\" as const;

/** Separator charcode for '\\, 92 */
export const sepCharCode = 92 as const;

/** Win32 file delimiter ';' */
export const delimiter = ";" as const;

/** Win32 file delimiter charcode for ';', 59 */
export const delimiterCharCode = 59;

/** Always false for win32 */
export const isPosix = false as const;

/** Always true for win32 */
export const isWin32 = true as const;

/** Returns true if the given path is the root */
export const isRootPath = (path: string): boolean => {
  const resolved = resolve(path);
  return dirname(resolved) === resolved;
};

/** Returns true if the given path appears to be a relative path. */
export const isRelative = (path: string) => !isAbsolute(path);

/** Returns true if the given string or character code is a win32 path separator, '\' or '/' */
export const isSep = (character: string | number | unknown): character is "/" | "\\" | 47 | 92 =>
  character === "/" || character === "\\" || character === 47 || character === 92;

/** Converts all / slashes to \ */
export const fixSlashes = (posixPath: string): string => posixPath.replace(WIN32_SEP_REGEX, "\\");

/** Splits a path into its components */
export const splitSlashes = (path: string): string[] => path.split(WIN32_SEP_REGEX);

/** Returns true if the given path starts with a slash */
export const startsWithSlash = (s: string): s is `\\${string}` => {
  const c = s.charCodeAt(0);
  return c === 47 || c === 92;
};

/** Returns true if the given path contains a '/' or a '\' slash */
export const includesSlash = (path: string): boolean => path.includes("/") || path.includes("\\");

/** Returns true if the given path ends with a "/" or "\\" or "/." or "\\." */
export const endsWithSlash = (s: string): s is `${string}\\` => {
  let c = s.charCodeAt(s.length - 1);
  if (c === 46) {
    c = s.charCodeAt(s.length - 2);
  }
  return c === 47 || c === 92;
};

/** Removes the final slash at the end of a path, if it was there. */
export const removeTrailingSlash = (path: string): string =>
  path.replace(WIN32_TRAIL_SEP_REGEX, "") || (startsWithSlash(path) ? path[0] || "" : "");

/** Appends the final slash at the end of a path, if it was not already there. */
export const appendTrailingSlash = (path: string): string => {
  const slash = path.includes("/") ? "/" : "\\";
  const s = path.replace(WIN32_TRAIL_SEP_REGEX, slash);
  const c = s.charCodeAt(s.length - 1);
  return c ? (c !== 47 && c !== 92 ? `${s}${slash}` : s) : "";
};

/** Returns true if the given child path is inside the given parent path. */
export const isPathInside = (childPath: string, parentPath: string): boolean => {
  const r = relative(parentPath, childPath);
  return !!r && r !== ".." && !r.startsWith(`..\\`) && r !== resolve(childPath);
};

/** Returns true if the given path is ".", ".." or if it starts with "./" or "../" or ".\" or "..\" */
export const startsWithRelative = (s: string): boolean => {
  if (s.charCodeAt(0) === 46) {
    const b = s.charCodeAt(1);
    if (!b || b === 47 || b === 92) {
      return true;
    }
    if (b === 46) {
      const c = s.charCodeAt(2);
      return !c || c === 47 || c === 92;
    }
  }
  return false;
};

/**
 * If the given path ends with '/', returns the path as it is.
 * If the given path ends with a filename, returns the directory followed by a slash.
 */
export const fileDir = (path: string): string => {
  const c = path.charCodeAt(path.length - 1);
  if (!c) {
    return "";
  }
  if (endsWithSlash(path)) {
    return appendTrailingSlash(path);
  }
  if (path === "." || path === ".." || path.endsWith("/..") || path.endsWith("\\..")) {
    return `${path}${path.includes("/") ? "/" : "\\"}`;
  }
  const d = dirname(path);
  return d === "." ? "" : appendTrailingSlash(d);
};

/** Normalize glob paths. The normal join collapses "**\/..", this avoid the issue. */
export const globNormalize = (glob: string): string =>
  normalize(glob.replace(GLOB_PARENT_REGEX, "\0")).replace(NULL_CHAR_REGEX, "..");

/** Joins glob paths. The normal join collapses "**\/..", this avoid the issue. */
export const globJoin = (
  ...parts: ((string | number | false | null | undefined)[] | string | number | false | null | undefined)[]
): string => globNormalize(_simpleJoin(parts));

/** Converts a file:// URL to a path */
export const pathFromFileURL = (url: string | Readonly<URL> | { readonly href: string }): string => {
  const parsed = url instanceof URL ? url : new URL((typeof url === "object" && url.href) || (url as UnsafeAny));
  if (parsed.protocol !== "file:") {
    throw new TypeError("Must be a file URL.");
  }
  const path = normalize(
    decodeURIComponent(parsed.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(
      /^\\*([A-Za-z]:)(\\|$)/,
      "$1\\",
    ),
  );
  return parsed.hostname ? `\\\\${parsed.hostname}${path}` : path;
};

/** Tries to converts a file:// URL to a path. Returns null if failed */
export const tryPathFromFileURL = (
  url: string | Readonly<URL> | { readonly href: string } | null | undefined,
): string | null => {
  try {
    return pathFromFileURL(url as UnsafeAny);
  } catch {}
  return null;
};

/** Converts an absolute path to a file URL. */
export const absolutePathToFileURL = (path: string): URL => {
  const match = path.match(WIN32_TO_URL_SPLIT_REGEX);
  if (!match) {
    throw new TypeError(`Invalid win32 path "${path}"`);
  }
  const hostname = match[1];
  const pathname = match[2] || "";
  const url = new URL("file:///");
  url.pathname = _encodeWhitespace(pathname.replace(/%/g, "%25"));
  if (hostname && hostname !== "localhost") {
    url.hostname = hostname;
  }
  return url;
};

/** Resolves a file or a directory maintaining the ending slash if present */
export const resolveFileOrDirectory = (path: string): string =>
  endsWithSlash(path) ? appendTrailingSlash(resolve(path)) : resolve(path);

/** Returns true if the given path starts with ./, ../ or / or looks like a win32 path */
export const looksLikeAbsoluteOrRelativePath = (path: string): boolean =>
  startsWithRelative(path) || startsWithSlash(path) || ABSOLUTE_OR_RELATIVE_PATH_REGEX.test(path);

export const getPathRoot = (fullpath: string): string => {
  const match = ROOT_PATH_REGEX.exec(fullpath);
  return (match && match[0]) || "/";
};

/** Removes the extension from a path */
export const stripExtension = (filePath: string): string => {
  const ext = extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
};

export * as posix from "./posix";

export * as win32 from "./win32";

export { win32 as default } from "./win32";
