import type { ChildProcess } from "node:child_process";
import treeKill from "tree-kill";

/** Kills all child processes of the given process id or ChildProcess instance. */
export function killProcessChildren(
  pid: number | ChildProcess | { pid: number | undefined } | null | undefined,
  signal?: NodeJS.Signals | number | undefined,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (!pid) {
      return resolve(false);
    }
    if (typeof pid === "object" && pid !== null) {
      pid = pid.pid;
      if (!pid) {
        return resolve(false);
      }
    }
    return treeKill(pid, signal, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
}
