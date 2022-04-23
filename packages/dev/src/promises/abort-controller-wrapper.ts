import { setTimeout } from "timers/promises";
import { AbortError } from "./abort-error";
import { withAbortSignal } from "./with-abort-signal";

export class AbortControllerWrapper implements AbortController {
  #abortController: AbortController;

  public constructor(abortController: AbortController) {
    this.#abortController = abortController;
    this.throwIfAborted = this.throwIfAborted.bind(this);
    this.getAbortError = this.getAbortError.bind(this);
    this.getOrCreateAbortError = this.getOrCreateAbortError.bind(this);
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
  public throwIfAborted(options?: AbortError.Options): void | never {
    if (!options || !options.caller) {
      options = { ...options, caller: AbortControllerWrapper.prototype.throwIfAborted };
    }
    withAbortSignal.throwIfAborted(this.signal, options);
  }

  /** Gets an AbortError instance */
  public getAbortError(options?: AbortError.Options): AbortError | undefined {
    if (!options || !options.caller) {
      options = { ...options, caller: AbortControllerWrapper.prototype.getAbortError };
    }
    return withAbortSignal.getAbortError(this.signal, options);
  }

  /** Gets or create an AbortError for this controller. It returns the instance also if not yet aborted. */
  public getOrCreateAbortError(options?: AbortError.Options): AbortError | undefined {
    if (!options || !options.caller) {
      options = { ...options, caller: AbortControllerWrapper.prototype.getOrCreateAbortError };
    }
    return withAbortSignal.getOrCreateAbortError(this.signal, options);
  }

  /** If a signal is aborted, it returns the abort reason. Returns undefined otherwise. */
  public getAbortReason(): unknown {
    return withAbortSignal.getAbortReason(this);
  }

  /** Aborts the abort controller, with a reason. */
  public abort(reason?: unknown, options?: AbortError.Options): boolean {
    if (!options || !options.caller) {
      options = { ...options, caller: AbortControllerWrapper.prototype.abort };
    }
    return withAbortSignal.abort(this.abortController, reason, options);
  }

  public async setTimeout<R = void>(delay: number, value?: R): Promise<R> {
    this.throwIfAborted();
    try {
      return await setTimeout(delay, value, { signal: this.signal });
    } catch (error) {
      throw (AbortError.isAbortError(error) && this.getAbortError()) || error;
    }
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
      this.signal.addEventListener("abort", () => fn, { once: true });
    }
  }
}
