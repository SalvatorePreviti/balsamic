export type ColorsLevel = 0 | 1 | 2 | 3;

export type Chalk = import("chalk").Chalk;

export interface Tsn {
  /** Internal tsn version number */
  readonly v: number;

  /** The package version of tsn that is running */
  readonly version: string;

  /** Workspace root path */
  get appRootPath(): string;

  /** Workspace root path */
  set appRootPath(value: string | null | undefined);

  /** The initial process.cwd() when tsn was loaded */
  get initialCwd(): string;

  /** The initial process.cwd() when tsn was loaded */
  set initialCwd(value: string);

  /** True if running inside continuous integration pipeline */
  get isCI(): boolean;

  /** True if running inside continuous integration pipeline */
  set isCI(value: boolean | null | undefined);

  /** The current process title */
  get processTitle(): string;

  /** The current process title */
  set processTitle(
    value:
      | string
      | {
          readonly filename?: string | undefined;
          readonly id?: string | undefined;
          readonly path?: string | undefined;
        },
  );

  get hasProcessTitle(): boolean;

  /** The instance of chalk used to color the terminal */
  get colors(): Chalk;

  /** The instance of chalk used to color the terminal */
  set colors(value: Chalk);

  /** An instance of Chalk that is always disabled. */
  get colors_disabled(): Chalk;

  /** An instance of Chalk that is always disabled. */
  set colors_disabled(value: Chalk);

  /** The current level of colors */
  get colorsLevel(): 0 | 1 | 2 | 3;

  /** The current level of colors */
  set colorsLevel(value: number | boolean | string | null);

  /** The current level of colors for stderr */
  get stderrColorsLevel(): 0 | 1 | 2 | 3;

  /** The current level of colors for stderr */
  set stderrColorsLevel(value: number | boolean | string | null);

  /** Load .env file */
  loadDotEnv(dotenvPath?: string | boolean | undefined): boolean;

  tryRequire<T = any>(module: string): T | undefined;

  tryResolve(module: string): string | undefined;

  /** patch mocha esm */
  patchMocha(): boolean;
}

export const tsn: Tsn;
