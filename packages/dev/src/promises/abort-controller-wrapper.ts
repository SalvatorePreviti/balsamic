import { setTimeout } from "timers/promises";
import { abortSignals } from "./abort-signals";

export class AbortControllerWrapper implements AbortController {
  #abortController: AbortController;

  public constructor(abortController: AbortController) {
    this.#abortController = abortController;
    this.rejectIfAborted = this.rejectIfAborted.bind(this);
    this.getAbortReason = this.getAbortReason.bind(this);
    this.abort = this.abort.bind(this);
    this.setTimeout = this.setTimeout.bind(this);
    this.addAbortHandler = this.addAbortHandler.bind(this);
  }

  public get abortController(): AbortController {
    return this.#abortController;
  }

  public get aborted(): boolean {
    return this.#abortController.signal.aborted;
  }

  public get signal(): AbortSignal & { reason?: any } {
    return this.#abortController.signal;
  }

  /** If the signal was aborted, throws an AbortError. If not, does nothing. */
  public rejectIfAborted(): Promise<void> {
    return abortSignals.rejectIfAborted(this.signal);
  }

  /** If a signal is aborted, it returns the abort reason. Returns undefined otherwise. */
  public getAbortReason(): unknown {
    return abortSignals.getAbortReason(this.signal);
  }

  /** Aborts the abort controller, with a reason. */
  public abort(reason?: unknown): boolean {
    return abortSignals.abort(this.abortController, reason);
  }

  public async setTimeout<R = void>(delay: number, value?: R): Promise<R> {
    return setTimeout(delay, value, { signal: this.signal });
  }

  /**
   * Adds a new function to execute on abort.
   * If already aborted, the function will be called straight away.
   * The function should not return a Promise.
   */
  public addAbortHandler(fn: (() => void) | null | undefined | false): void {
    if (typeof fn !== "function") {
      return;
    }
    if (this.aborted) {
      fn();
    } else {
      this.signal.addEventListener("abort", () => fn(), { once: true });
    }
  }
}
