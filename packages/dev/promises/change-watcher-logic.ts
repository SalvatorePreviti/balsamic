import { devError } from "../dev-error";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { ChildProcessWrapper } from "../processes/child-process-wrapper";
import type { TimeoutType } from "../types";
import { noop } from "../utils/utils";
import { AbortError } from "./abort-error";
import { abortSignals } from "./abort-signals";
import { Deferred } from "./deferred";
import { ServicesRunner } from "./services-runner";

export namespace ChangeWatcherLogic {
  export interface Options {
    title: string;
    timed?: boolean | undefined;
    buildRunner?: ServicesRunner | ServicesRunner.Options | null | undefined;
    signal?: AbortSignal | undefined | null;

    devLogTimedOptions?: DevLogTimeOptions | undefined;
    initialDebounceTimer?: number | undefined;
    defaultDebounceTimer?: number | undefined;
    filesChangedDuringBuildDebounceTimer?: number | undefined;
    loggingEnabled?: boolean | undefined;

    onBuild?: ((error: Error | null) => void | Promise<unknown>) | undefined;
    onClose?: (() => void | Promise<unknown>) | undefined;
  }

  export type BuildFunction = (this: ChangeWatcherLogic, buildRunner: ServicesRunner) => void | Promise<unknown>;
}

export class ChangeWatcherLogic implements ServicesRunner.Service {
  public buildRunner: ServicesRunner;
  public title: string;

  public defaultDebounceTimer: number;
  public filesChangedDuringBuildDebounceTimer: number;
  public devLogTimedOptions: DevLogTimeOptions;
  public loggingEnabled: boolean;

  /** A number that gets incremented each time a new build starts */
  public buildCount: number = 0;

  private _fileChangedVersion: number = 0;
  private _lastBuildVersion: number = -1;
  private _initialDebounceTimer: number;
  private _building: boolean = false;
  private _fileChanged: boolean | null = null;
  private _closePromise: Promise<void> | null = null;
  private _buildingPromise: Promise<void> | null | undefined = undefined;
  private _firstBuildDeferred = new Deferred<void>().ignoreUnhandledRejection();
  private _closedDeferred: Deferred<void> | null = null;
  private _fileChangeDebounceTimer: TimeoutType | null = null;
  private _onBuild: ((error: Error | null) => void | Promise<unknown>) | undefined;
  private _onClose: (() => void | Promise<unknown>) | undefined;
  private _removeInitialSignalHandler = noop;
  private _runBuild: () => Promise<void>;

  public buildFunction: ChangeWatcherLogic.BuildFunction;

  public constructor(buildFunction: ChangeWatcherLogic.BuildFunction, options: ChangeWatcherLogic.Options) {
    this.title = options.title;
    this._initialDebounceTimer = options.initialDebounceTimer ?? 0;
    this.defaultDebounceTimer = options.defaultDebounceTimer ?? 1000;
    this.filesChangedDuringBuildDebounceTimer =
      options.filesChangedDuringBuildDebounceTimer ?? Math.min(250, this.defaultDebounceTimer);
    this.loggingEnabled = !!(options.loggingEnabled ?? true);
    this.devLogTimedOptions = { ...options.devLogTimedOptions };
    if (this.devLogTimedOptions.timed === undefined && !this.loggingEnabled) {
      this.devLogTimedOptions.timed = false;
    }
    this._onBuild = options.onBuild;
    this._onClose = options.onClose;

    this.close = this.close.bind(this);
    this.notify = this.notify.bind(this);
    this.awaitFirstBuild = this.awaitFirstBuild.bind(this);
    this.awaitClosed = this.awaitClosed.bind(this);
    this.startFirstBuild = this.startFirstBuild.bind(this);

    this._removeInitialSignalHandler = abortSignals.addAbortHandler(options.signal, () => {
      this.close();
    });

    this.buildFunction = buildFunction;
    if (typeof buildFunction !== "function") {
      throw new TypeError("buildFunction must be a function");
    }

    const optionsBuildRunner = options.buildRunner;
    this.buildRunner =
      typeof optionsBuildRunner === "object" && optionsBuildRunner !== null
        ? "run" in optionsBuildRunner &&
          typeof optionsBuildRunner.run === "function" &&
          typeof optionsBuildRunner.abort === "function"
          ? optionsBuildRunner
          : new ServicesRunner(optionsBuildRunner)
        : new ServicesRunner();

    this._runBuild = async () => {
      if (this._fileChangeDebounceTimer) {
        clearTimeout(this._fileChangeDebounceTimer);
        this._fileChangeDebounceTimer = null;
      }

      if (this._closePromise) {
        return;
      }

      if (this._building) {
        const debouncedBuild = () => {
          this._buildingPromise = this._buildingPromise?.finally(this._runBuild) ?? this._runBuild();
        };

        this._fileChangeDebounceTimer = setTimeout(debouncedBuild, this.filesChangedDuringBuildDebounceTimer);
        return;
      }

      if (this._lastBuildVersion === this._fileChangedVersion) {
        return;
      }

      try {
        this.buildRunner.abort("rebuilding");
        await this.buildRunner.awaitAll({ awaitRun: true, rejectOnError: false }).catch(noop);

        if (this._closePromise) {
          return;
        }

        let error: Error | null = null;

        ++this.buildCount;
        this._building = true;
        this._fileChanged = false;
        try {
          this.buildRunner.abort();
          this.buildRunner.abortController = new AbortController();
          await this.buildRunner.run(
            devLog.timed(
              this.title,
              async () => {
                await this.buildFunction(this.buildRunner);
                this._firstBuildDeferred.resolve();
              },
              { ...ChildProcessWrapper.defaultOptions, ...this.devLogTimedOptions },
            ),
          );
        } catch (e) {
          error = devError(e);
          if (this.loggingEnabled) {
            devLog.logException(this.title, error);
          }
        } finally {
          if (!this.fileChanged) {
            this._lastBuildVersion = this._fileChangedVersion;
          }
          this._building = false;
        }

        if (this._onBuild) {
          try {
            await this._onBuild(error);
          } catch {}
        }
      } catch {}
    };
  }

  /** True if building is in progress. */
  public get building(): boolean {
    return this._building;
  }

  /** True if a file changed and we are awaiting for rebuild. */
  public get fileChanged(): boolean {
    return !!this._fileChanged || this._lastBuildVersion !== this._fileChangedVersion;
  }

  /** True if the service is stopped and no longer accepting notifications. */
  public get closed(): boolean {
    return !!this._closePromise;
  }

  /** True if the first build is still not executed or still not completed. */
  public get firstBuildPending(): boolean {
    return this._firstBuildDeferred.isRunning;
  }

  /** True if the service was closed without a successful first build. */
  public get firstBuildFailed(): boolean {
    return this._firstBuildDeferred.isRejected;
  }

  /** True if the first build was completed successfully. */
  public get firstBuildSucceeded(): boolean {
    return this._firstBuildDeferred.isSucceeded;
  }

  /** Returns a promise that resolves when the first build completes or when the watcher is stopped. */
  public awaitFirstBuild(): Promise<void> {
    return this._firstBuildDeferred.promise;
  }

  /** Starts a first build. This function does nothing if called multiple times. */
  public startFirstBuild(options?: { debounceTimer?: number | undefined }): boolean {
    if (this._fileChanged !== null || this.closed) {
      return false;
    }
    this._fileChanged = true;
    this.notify({ debounceTimer: options?.debounceTimer ?? this._initialDebounceTimer });
    return true;
  }

  /** Starts the first build and await for it. */
  public firstBuild(options?: { debounceTimer?: number | undefined } | undefined): Promise<void> {
    this.startFirstBuild(options);
    return this.awaitFirstBuild();
  }

  /** Returns a promise that resolves when the service gets closed. */
  public async awaitClosed(): Promise<void> {
    let closePromise = this._closePromise;
    if (closePromise) {
      return closePromise;
    }

    await (this._closedDeferred || (this._closedDeferred = new Deferred<void>())).promise;
    closePromise = this._closePromise;
    if (closePromise) {
      return closePromise;
    }

    return undefined;
  }

  /** Notifies something changed and buildFunction need to execute again. */
  public notify(options?: { debounceTimer?: number | undefined } | undefined) {
    if (this._closePromise) {
      return;
    }

    ++this._fileChangedVersion;

    if (!this._fileChanged && this._fileChanged !== null) {
      devLog.info();
      devLog.info(`${this.title}, file changed...`);
      devLog.info();
      this._fileChanged = true;
    }

    if (this._building) {
      this.buildRunner.abort(new AbortError.AbortOk(`${this.title}: file changed`));
    }

    let debounceTimer = options?.debounceTimer;
    if (typeof debounceTimer !== "number") {
      debounceTimer = this.defaultDebounceTimer;
      if (this._building && this.filesChangedDuringBuildDebounceTimer) {
        debounceTimer = this.filesChangedDuringBuildDebounceTimer;
      }
    }

    if (this._fileChangeDebounceTimer) {
      clearTimeout(this._fileChangeDebounceTimer);
    }

    const debouncedBuild = () => {
      this._buildingPromise = this._buildingPromise?.finally(this._runBuild) ?? this._runBuild();
    };

    this._fileChangeDebounceTimer = global.setTimeout(debouncedBuild, debounceTimer);
  }

  public close(): Promise<void> {
    if (!this._closePromise) {
      const doStop = async () => {
        this._removeInitialSignalHandler();
        this._removeInitialSignalHandler = noop;
        if (this._fileChangeDebounceTimer) {
          clearTimeout(this._fileChangeDebounceTimer);
          this._fileChangeDebounceTimer = null;
        }
        devLog.logBlackBright(`* ${this.title} watcher stop.`);
        this.buildRunner.abort("Stop");
        this._fileChanged = false;
        const [onCloseResult] = await Promise.allSettled([
          this._onClose?.(),
          this.buildRunner.awaitAll({ awaitRun: true, rejectOnError: false }),
          this._buildingPromise?.catch(noop),
        ]);
        this._firstBuildDeferred.reject(new AbortError(`${this.title}: stopped`));
        this._closedDeferred?.resolve();
        if (onCloseResult.status === "rejected" && onCloseResult.reason instanceof Error) {
          throw onCloseResult.reason;
        }
      };
      this._closePromise = doStop();
    }
    return this._closePromise;
  }

  public async [ServicesRunner.serviceRunnerServiceSymbol](runner: ServicesRunner) {
    const removeAbortHandler = !this.closed && runner.addAbortHandler(this);
    try {
      await this.awaitFirstBuild();
      await this.awaitClosed();
    } finally {
      if (removeAbortHandler) {
        removeAbortHandler();
      }
    }
  }
}
