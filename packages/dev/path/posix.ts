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

const POSIX_SEP_REGEX = /(?:\/+\.)*\/+/g;
const POSIX_TRAIL_SEP_REGEX = /(?:\/+\.)*\/+\.?$/g;
const GLOB_PARENT_REGEX = /(?<=((?:\/+\.)*\/+|^)\*\*(?:\/+\.)*\/+)\.\.(?=(?:\/+\.)*\/+|$)/g;

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
} = _nodePath.posix;

/** Posix path separator '/' */
export const sep = "/" as const;

/** Separator charcode for '/', 47 */
export const sepCharCode = 47 as const;

/** Posix file delimiter ':' */
export const delimiter = ":" as const;

/** Win32 file delimiter charcode for ':', 58 */
export const delimiterCharCode = 58;

/** Always true for posix */
export const isPosix = true as const;

/** Always false for posix */
export const isWin32 = false as const;

/** Returns true if the given path is the root */
export const isRootPath = (path: string): boolean => resolve(path) === "/";

/** Converts all \ slashes to / */
export const fixSlashes = (path: string): string => path.replace(WIN32_SEP_REGEX, "/");

/** Returns true if the given path appears to be a relative path. */
export const isRelative = (path: string) => !isAbsolute(path);

/** Returns true if the given string or character code is the posix path separator '/' */
export const isSep = (character: string | number | unknown): character is "/" | 47 =>
  character === "/" || character === 47;

/** Splits a path into its components */
export const splitSlashes = (path: string): string[] => path.split(POSIX_SEP_REGEX);

/** Returns true if the given path starts with a slash */
export const startsWithSlash = (path: string): path is `/${string}` => path.charCodeAt(0) === 47;

/** Returns true if the given path contains a '/' slash */
export const includesSlash = (path: string): boolean => path.includes("/");

/** Returns true if the given path ends with a slash */
export const endsWithSlash = (path: string): path is `${string}/` => path.charCodeAt(path.length - 1) === 47;

/** Removes the final slash at the end of a path, if it was there. Leave root as is. */
export const removeTrailingSlash = (path: string): string =>
  path.replace(POSIX_TRAIL_SEP_REGEX, "") || (startsWithSlash(path) ? "/" : "");

/** Appends the final slash at the end of a path, if it was not already there. */
export const appendTrailingSlash = (path: string): string => {
  const s = path.replace(POSIX_TRAIL_SEP_REGEX, "/");
  const c = s.charCodeAt(s.length - 1);
  return c ? (c !== 47 ? `${s}${"/"}` : s) : "";
};

/** Returns true if the given child path is inside the given parent path. */
export const isPathInside = (childPath: string, parentPath: string): boolean => {
  const r = relative(parentPath, childPath);
  return !!r && r !== ".." && !r.startsWith(`../`) && r !== resolve(childPath);
};

/** Returns true if the given path is ".", ".." or if it starts with "./" or "../" */
export const startsWithRelative = (s: string): boolean => {
  if (s.charCodeAt(0) === 46) {
    const b = s.charCodeAt(1);
    if (!b || b === 47) {
      return true;
    }
    if (b === 46) {
      const c = s.charCodeAt(2);
      return !c || c === 47;
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
  if (path === "." || path === ".." || path.endsWith("/..")) {
    return `${path}/`;
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
  return normalize(decodeURIComponent(parsed.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")));
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
  const url = new URL("file:///");
  url.pathname = _encodeWhitespace(globNormalize(path).replace(/%/g, "%25").replace(/\\/g, "%5C"));
  return url;
};

/** Returns true if the given path starts with ./, ../ or / */
export const looksLikeAbsoluteOrRelativePath = (path: string): boolean =>
  startsWithRelative(path) || startsWithSlash(path);

/** Resolves a file or a directory maintaining the ending slash if present */
export const resolveFileOrDirectory = (path: string): string =>
  endsWithSlash(path) ? appendTrailingSlash(resolve(path)) : resolve(path);

/** Gets the root path of a full path. Since this is posix, root is always "/" */
export const getPathRoot = (_fullpath: string): string => {
  return "/";
};

/** Removes the extension from a path */
export const stripExtension = (filePath: string): string => {
  const ext = extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
};

export * as posix from "./posix";

export * as win32 from "./win32";

export { posix as default } from "./posix";
