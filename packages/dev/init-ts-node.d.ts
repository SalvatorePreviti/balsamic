import type { WorkerOptions } from "worker_threads";
import { Worker } from "worker_threads";

export type TsWorkerOptions = Omit<WorkerOptions, "eval">;

export class TsWorker extends Worker {
  public constructor(filename: string | URL, options?: TsWorkerOptions);
}
