import { normalize, relative, isAbsolute } from "path";

/** Makes a path relative and nicely printable */
export function makePathRelative(
  filePath: string | null | undefined,
  cwdOrOptions?: { cwd?: string; startDot?: boolean } | string | undefined | null,
): string {
  if (!filePath) {
    return "./";
  }
  let cwd: string | undefined;
  let startDot: boolean | undefined;
  if (typeof cwdOrOptions === "string") {
    cwd = cwdOrOptions;
  } else if (typeof cwdOrOptions === "object" && cwdOrOptions !== null) {
    cwd = cwdOrOptions.cwd;
    startDot = cwdOrOptions?.startDot;
  }
  if (!cwd || cwd === "." || cwd === "./") {
    cwd = process.cwd();
  }
  filePath = `${filePath}`;
  let result: string;
  try {
    const relativePath = normalize(relative(cwd, filePath));
    result = relativePath && relativePath.length < filePath.length ? relativePath : filePath;
  } catch {
    result = filePath;
  }
  if (!startDot) {
    return result;
  }
  if (isAbsolute(result) || result.startsWith("./") || result.includes(":")) {
    return result;
  }
  return `./${result}`;
}

export * as path from "../path";
