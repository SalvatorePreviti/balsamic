import { platform } from "os";
import _posix from "./posix";
import _win32 from "./win32";

export type { FormatInputPathObject, ParsedPath } from "path";

export type PlatformPath = typeof _posix | typeof _win32 | typeof import(".");

export const {
  posix,
  win32,
  /** True if platform is posix */
  isPosix,
  /** True if platform is win32 */
  isWin32,
  /** Directory separator. "\\" for windows, "/" for posix. */
  sep,
  /** The numeric character code for the path separator */
  sepCharCode,
  /** The path delimiter, ";" for windows, ":" for posix */
  delimiter,
  /** The numeric character code for the path delimiter */
  delimiterCharCode,
  /**
   * Return the last portion of a path. Similar to the Unix basename command.
   * Often used to extract the file name from a fully qualified path.
   *
   * @param p the path to evaluate.
   * @param ext optionally, an extension to remove from the result.
   */
  basename,
  /**
   * Return the directory name of a path. Similar to the Unix dirname command.
   *
   * @param p the path to evaluate.
   */
  dirname,
  /**
   * Return the extension of the path, from the last '.' to end of string in the last portion of the path.
   * If there is no '.' in the last portion of the path or the first character of it is '.', then it returns an empty string
   *
   * @param p the path to evaluate.
   */
  extname,
  /**
   * Returns a path string from an object - the opposite of parse().
   *
   * @param pathString path to evaluate.
   */
  format,
  /**
   * Determines whether {path} is an absolute path. An absolute path will always resolve to the same location, regardless of the working directory.
   *
   * @param path path to test.
   */
  isAbsolute,
  /**
   * Join all arguments together and normalize the resulting path.
   * Arguments must be strings. In v0.8, non-string arguments were silently ignored. In v0.10 and up, an exception is thrown.
   *
   * @param paths paths to join.
   */
  join,
  /**
   * Normalize a string path, reducing '..' and '.' parts.
   * When multiple slashes are found, they're replaced by a single one; when the path contains a trailing slash, it is preserved. On Windows backslashes are used.
   *
   * @param p string path to normalize.
   */
  normalize,
  /**
   * Returns an object from a path string - the opposite of format().
   *
   * @param pathString path to evaluate.
   */
  parse,
  /**
   * Solve the relative path from {from} to {to}.
   * At times we have two absolute paths, and we need to derive the relative path from one to the other. This is actually the reverse transform of path.resolve.
   */
  relative,
  /**
   * The right-most parameter is considered {to}.  Other parameters are considered an array of {from}.
   *
   * Starting from leftmost {from} parameter, resolves {to} to an absolute path.
   *
   * If {to} isn't already absolute, {from} arguments are prepended in right to left order,
   * until an absolute path is found. If after using all {from} paths still no absolute path is found,
   * the current working directory is used as well. The resulting path is normalized,
   * and trailing slashes are removed unless the path gets resolved to the root directory.
   *
   * @param pathSegments string paths to join.  Non-string arguments are ignored.
   */
  resolve,
  /**
   * On Windows systems only, returns an equivalent namespace-prefixed path for the given path.
   * If path is not a string, path will be returned without modifications.
   * This method is meaningful only on Windows system.
   * On POSIX systems, the method is non-operational and always returns path without modifications.
   */
  toNamespacedPath,
  /** Test whether the given string looks like a glob */
  isGlob,
  /** Checks if the given path is a win32 UNC path. */
  isUNCPath,
  /** Returns true if the given string or character code is a win32 path separator, '\' or '/' */
  isSep,
  fixSlashes,
  /** Converts all / slashes to \ on windows, converts all \ slashes to / on posix. */
  splitSlashes,
  /** Appends the final slash at the end of a path, if it was not already there. */
  appendTrailingSlash,
  /** Returns true if the given path ends with a "/" or "\\" or "/." or "\\." */
  endsWithSlash,
  /** Returns true if the given child path is inside the given parent path. */
  isPathInside,
  /** Returns true if the given path appears to be a relative path. */
  isRelative,
  /** Removes the final slash at the end of a path, if it was there. */
  removeTrailingSlash,
  /** Returns true if the given path is ".", ".." or if it starts with "./" or "../" or ".\" or "..\" */
  startsWithRelative,
  /** Returns true if the given path starts with a slash */
  startsWithSlash,
  /** Returns true if the given path includes with a slash */
  includesSlash,
  /** Returns true if the given path starts with file:// */
  looksLikeFileURL,
  /** Returns true if the given path is the root */
  isRootPath,
  /**
   * If the given path ends with '/' (or \ on windows) returns the path as it is.
   * If the given path ends with a filename, returns the directory followed by a slash.
   */
  fileDir,
  /** Normalize glob paths. The normal join collapses "**\/..", this avoid the issue. */
  globNormalize,
  /** Joins glob paths. The normal join collapses "**\/..", this avoid the issue. */
  globJoin,
  /** Converts a file:// URL to a path */
  pathFromFileURL,
  /** Tries to converts a file:// URL to a path. Returns null if failed */
  tryPathFromFileURL,
  /** Converts an absolute path to a file URL. */
  absolutePathToFileURL,
  /** Returns true if the given path starts with ./, ../ or / */
  looksLikeAbsoluteOrRelativePath,
  /** Parses a node package path. Example hello/subpath */
  parseNodePackageName,
  /** Resolves a file or a directory maintaining the ending slash if present */
  resolveFileOrDirectory,
  /** Gets the root path of a full path. Since this is posix, root is always "/" */
  getPathRoot,
} = platform() === "win32" ? _win32 : _posix;

/** Makes a path relative and nicely printable */
export function makePathRelative(filePath: string | null | undefined, cwd?: string | undefined | null) {
  if (!filePath) {
    return "./";
  }
  if (!cwd || cwd === "." || cwd === "./") {
    cwd = process.cwd();
  }
  try {
    const relativePath = normalize(relative(cwd, filePath));
    return relativePath && relativePath.length < filePath.length ? relativePath : filePath;
  } catch {
    return filePath;
  }
}

export * as path from "./path";
