import { devError } from "../dev-error";
import { devLog, DevLogTimeOptions } from "../dev-log";
import { ChildProcessWrapper } from "../processes/child-process-wrapper";
import { noop } from "../utils";
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

  #initialDebounceTimer: number;
  #building: boolean = false;
  #fileChanged: boolean | null = null;
  #closePromise: Promise<void> | null = null;
  #buildingPromise: Promise<void> | null;
  #firstBuildDeferred = new Deferred<void>().ignoreUnhandledRejection();
  #closedDeferred: Deferred<void> | null = null;
  #fileChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  #filesChangedDuringBuild: boolean = false;
  #onBuild: ((error: Error | null) => void | Promise<unknown>) | undefined;
  #onClose: (() => void | Promise<unknown>) | undefined;
  #removeInitialSignalHandler = noop;
  #runBuild: () => Promise<void>;

  public buildFunction: ChangeWatcherLogic.BuildFunction;

  public constructor(buildFunction: ChangeWatcherLogic.BuildFunction, options: ChangeWatcherLogic.Options) {
    this.title = options.title;
    this.#initialDebounceTimer = options.initialDebounceTimer ?? 0;
    this.defaultDebounceTimer = options.defaultDebounceTimer ?? 1000;
    this.filesChangedDuringBuildDebounceTimer =
      options.filesChangedDuringBuildDebounceTimer ?? Math.min(250, this.defaultDebounceTimer);
    this.loggingEnabled = !!(options.loggingEnabled ?? true);
    this.devLogTimedOptions = { ...options.devLogTimedOptions };
    if (this.devLogTimedOptions.timed === undefined && !this.loggingEnabled) {
      this.devLogTimedOptions.timed = false;
    }
    this.#onBuild = options.onBuild;
    this.#onClose = options.onClose;

    this.close = this.close.bind(this);
    this.notify = this.notify.bind(this);
    this.awaitFirstBuild = this.awaitFirstBuild.bind(this);
    this.awaitClosed = this.awaitClosed.bind(this);
    this.startFirstBuild = this.startFirstBuild.bind(this);

    this.#removeInitialSignalHandler = abortSignals.addAbortHandler(options.signal, () => {
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

    this.#runBuild = async () => {
      try {
        this.buildRunner.abort();

        await this.buildRunner.awaitAll({ awaitRun: true, rejectOnError: false }).catch(noop);

        if (this.#building || this.#closePromise) {
          return;
        }

        ++this.buildCount;
        this.#building = true;
        this.#filesChangedDuringBuild = false;
        this.#fileChanged = false;
        let error: Error | null = null;
        try {
          this.buildRunner.abortController = new AbortController();
          await this.buildRunner.run(
            devLog.timed(
              this.title,
              async () => {
                await this.buildFunction(this.buildRunner);
                this.#firstBuildDeferred.resolve();
              },
              { ...ChildProcessWrapper.defaultOptions, ...this.devLogTimedOptions },
            ),
          );
        } catch (e) {
          error = devError(e);
          if (this.loggingEnabled) {
            devLog.logException(this.title, error);
          }
        }

        this.#building = false;

        if (this.#onBuild) {
          try {
            await this.#onBuild(error);
          } catch {}
        }

        if (this.#filesChangedDuringBuild) {
          this.notify({ debounceTimer: this.filesChangedDuringBuildDebounceTimer });
        }
      } catch {}
    };
  }

  /** True if building is in progress. */
  public get building(): boolean {
    return this.#building;
  }

  /** True if a file changed and we are awaiting for rebuild. */
  public get fileChanged(): boolean {
    return !!this.#fileChanged;
  }

  /** True if the service is stopped and no longer accepting notifications. */
  public get closed(): boolean {
    return !!this.#closePromise;
  }

  /** True if the first build is still not executed or still not completed. */
  public get firstBuildPending(): boolean {
    return this.#firstBuildDeferred.isRunning;
  }

  /** True if the service was closed without a successful first build. */
  public get firstBuildFailed(): boolean {
    return this.#firstBuildDeferred.isRejected;
  }

  /** True if the first build was completed succesfully. */
  public get firstBuildSucceeded(): boolean {
    return this.#firstBuildDeferred.isSucceeded;
  }

  public get filesChangedDuringBuild(): boolean {
    return this.#filesChangedDuringBuild;
  }

  /** Returns a promise that resolves when the first build completes or when the watcher is stopped. */
  public awaitFirstBuild(): Promise<void> {
    return this.#firstBuildDeferred.promise;
  }

  /** Starts a first build. This function does nothing if called multiple times. */
  public startFirstBuild(options?: { debounceTimer?: number | undefined }): boolean {
    if (this.#fileChanged !== null || this.closed) {
      return false;
    }
    this.#fileChanged = true;
    this.notify({ debounceTimer: options?.debounceTimer ?? this.#initialDebounceTimer });
    return true;
  }

  /** Starts the first build and await for it. */
  public firstBuild(options?: { debounceTimer?: number | undefined } | undefined): Promise<void> {
    this.startFirstBuild(options);
    return this.awaitFirstBuild();
  }

  /** Returns a promise that resolves when the service gets closed. */
  public async awaitClosed(): Promise<void> {
    let closePromise = this.#closePromise;
    if (closePromise) {
      return closePromise;
    }

    await (this.#closedDeferred || (this.#closedDeferred = new Deferred<void>())).promise;
    closePromise = this.#closePromise;
    if (closePromise) {
      return closePromise;
    }

    return undefined;
  }

  /** Notifies something changed and buildFunction need to execute again. */
  public notify(options?: { debounceTimer?: number | undefined } | undefined) {
    if (!this.#closePromise) {
      if (!this.#fileChanged && this.#fileChanged !== null) {
        devLog.info();
        devLog.info(`${this.title}, file changed...`);
        devLog.info();
        this.#fileChanged = true;
      }

      if (this.#building && !this.#filesChangedDuringBuild) {
        this.#filesChangedDuringBuild = true;
        this.buildRunner.abort(new AbortError.AbortOk(`${this.title}: file changed`));
      }

      let debounceTimer = options?.debounceTimer;
      if (typeof debounceTimer !== "number") {
        debounceTimer = this.defaultDebounceTimer;
      }

      if (this.#fileChangeDebounceTimer) {
        clearTimeout(this.#fileChangeDebounceTimer);
      }

      const debouncedBuild = () => {
        this.#buildingPromise = this.#buildingPromise?.finally(this.#runBuild) ?? this.#runBuild();
      };

      this.#fileChangeDebounceTimer = global.setTimeout(debouncedBuild, debounceTimer);
    }
  }

  public close(): Promise<void> {
    if (!this.#closePromise) {
      const doStop = async () => {
        this.#removeInitialSignalHandler();
        this.#removeInitialSignalHandler = noop;
        if (this.#fileChangeDebounceTimer) {
          clearTimeout(this.#fileChangeDebounceTimer);
          this.#fileChangeDebounceTimer = null;
        }
        devLog.logBlackBright(`* ${this.title} watcher stop.`);
        this.buildRunner.abort("Stop");
        this.#fileChanged = null;
        const [onCloseResult] = await Promise.allSettled([
          this.#onClose?.(),
          this.buildRunner.awaitAll({ awaitRun: true, rejectOnError: false }),
          this.#buildingPromise?.catch(noop),
        ]);
        this.#fileChanged = null;
        this.#firstBuildDeferred.reject(new AbortError(`${this.title}: stopped`));
        this.#closedDeferred?.resolve();
        if (onCloseResult.status === "rejected" && onCloseResult.reason instanceof Error) {
          throw onCloseResult.reason;
        }
      };
      this.#closePromise = doStop();
    }
    return this.#closePromise;
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
