import type { PathLike } from "node:fs";
import fs from "node:fs";

export function try_realpathSync(unrealpath: string): string | null {
  try {
    return fs.realpathSync.native(unrealpath);
  } catch (_) {
    return null;
  }
}

export function try_statSync(realpath: string, options?: { bigint?: false | undefined | null }): fs.Stats | null;

export function try_statSync(realpath: string, options?: { bigint: true }): fs.BigIntStats | null;

export function try_statSync(realpath: string, options?: { bigint: boolean }): fs.Stats | fs.BigIntStats | null;

export function try_statSync(
  realpath: string,
  options?: { bigint?: boolean | undefined | null },
): fs.Stats | fs.BigIntStats | null {
  try {
    return fs.statSync(realpath, { bigint: (options && options.bigint) || false, throwIfNoEntry: false }) || null;
  } catch {}
  return null;
}

export function try_stat(realpath: string, options?: { bigint?: false | undefined | null }): Promise<fs.Stats | null>;

export function try_stat(realpath: string, options?: { bigint: true }): Promise<fs.BigIntStats | null>;

export function try_stat(realpath: string, options?: { bigint: boolean }): Promise<fs.Stats | fs.BigIntStats | null>;

export async function try_stat(
  realpath: string,
  options?: { bigint?: boolean | undefined | null },
): Promise<fs.Stats | fs.BigIntStats | null> {
  try {
    return await fs.promises.stat(realpath, { bigint: (options && options.bigint) || false });
  } catch {}
  return null;
}

export function try_lstatSync(realpath: PathLike, options?: { bigint?: false | undefined | null }): fs.Stats | null;

export function try_lstatSync(realpath: PathLike, options?: { bigint: true }): fs.BigIntStats | null;

export function try_lstatSync(realpath: PathLike, options?: { bigint: boolean }): fs.Stats | fs.BigIntStats | null;

export function try_lstatSync(
  realpath: PathLike,
  options?: { bigint?: boolean | undefined | null },
): fs.Stats | fs.BigIntStats | null {
  try {
    return fs.lstatSync(realpath, { bigint: (options && options.bigint) || false, throwIfNoEntry: false }) || null;
  } catch {}
  return null;
}

export function try_lstat(
  realpath: PathLike,
  options?: { bigint?: false | undefined | null },
): Promise<fs.Stats | null>;

export function try_lstat(realpath: PathLike, options: { bigint: true }): Promise<fs.BigIntStats | null>;

export function try_lstat(realpath: PathLike, options: { bigint: boolean }): Promise<fs.Stats | fs.BigIntStats | null>;

export async function try_lstat(
  realpath: PathLike,
  options?: { bigint?: boolean | undefined | null },
): Promise<fs.Stats | fs.BigIntStats | null> {
  try {
    return await fs.promises.lstat(realpath, { bigint: (options && options.bigint) || false });
  } catch {}
  return null;
}

/** Check if a path exists */
export async function try_access(p: PathLike, mode?: number) {
  try {
    await fs.promises.access(p, mode);
    return true;
  } catch {
    return false;
  }
}

/** Check if a path exists */
export function try_accessSync(p: PathLike, mode?: number) {
  try {
    fs.accessSync(p, mode);
    return true;
  } catch {
    return false;
  }
}
