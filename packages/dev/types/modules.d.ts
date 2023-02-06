declare module "normalize-package-data" {
  export = normalize;

  declare function normalize(data: normalize.Input, warn?: normalize.WarnFn, strict?: boolean): void;
  declare function normalize(data: normalize.Input, strict?: boolean): void;

  declare namespace normalize {
    type WarnFn = (msg: string) => void;
    interface Input {
      [k: string]: any;
    }

    interface Person {
      name?: string | undefined;
      email?: string | undefined;
      url?: string | undefined;
    }

    interface Package {
      [k: string]: any;
      name: string;
      version: string;
      files?: string[] | undefined;
      bin?: { [k: string]: string } | undefined;
      man?: string[] | undefined;
      keywords?: string[] | undefined;
      author?: Person | undefined;
      maintainers?: Person[] | undefined;
      contributors?: Person[] | undefined;
      bundleDependencies?: { [name: string]: string } | undefined;
      dependencies?: { [name: string]: string } | undefined;
      devDependencies?: { [name: string]: string } | undefined;
      optionalDependencies?: { [name: string]: string } | undefined;
      description?: string | undefined;
      engines?: { [type: string]: string } | undefined;
      license?: string | undefined;
      repository?: { type: string; url: string } | undefined;
      bugs?: { url: string; email?: string | undefined } | { url?: string | undefined; email: string } | undefined;
      homepage?: string | undefined;
      scripts?: { [k: string]: string } | undefined;
      readme: string;
      _id: string;
    }
  }
}

declare module "which" {
  // Type definitions for which 2.0
  // Project: https://github.com/isaacs/node-which
  // Definitions by: vvakame <https://github.com/vvakame>
  //                 cspotcode <https://github.com/cspotcode>
  //                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
  // Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

  /** Finds all instances of a specified executable in the PATH environment variable */
  function which(
    cmd: string,
    options: which.AsyncOptions & which.OptionsAll,
    cb: (err: Error | null, paths: readonly string[] | undefined) => void,
  ): void;
  function which(
    cmd: string,
    options: which.AsyncOptions & which.OptionsFirst,
    cb: (err: Error | null, path: string | undefined) => void,
  ): void;
  function which(
    cmd: string,
    options: which.AsyncOptions,
    cb: (err: Error | null, path: string | readonly string[] | undefined) => void,
  ): void;
  function which(cmd: string, cb: (err: Error | null, path: string | undefined) => void): void;
  function which(cmd: string, options: which.AsyncOptions & which.OptionsAll): Promise<string[]>;
  function which(cmd: string, options?: which.AsyncOptions & which.OptionsFirst): Promise<string>;

  namespace which {
    /** Finds all instances of a specified executable in the PATH environment variable */
    export function sync(cmd: string, options: Options & OptionsAll & OptionsNoThrow): readonly string[] | null;
    export function sync(cmd: string, options: Options & OptionsFirst & OptionsNoThrow): string | null;
    export function sync(cmd: string, options: Options & OptionsAll & OptionsThrow): readonly string[];
    export function sync(cmd: string, options?: Options & OptionsFirst & OptionsThrow): string;
    export function sync(cmd: string, options: Options): string | readonly string[] | null;

    /** Options that ask for all matches. */
    export interface OptionsAll extends AsyncOptions {
      all: true;
    }

    /** Options that ask for the first match (the default behavior) */
    export interface OptionsFirst extends AsyncOptions {
      all?: false | undefined;
    }

    /** Options that ask to receive null instead of a thrown error */
    export interface OptionsNoThrow extends Options {
      nothrow: true;
    }

    /** Options that ask for a thrown error if executable is not found (the default behavior) */
    export interface OptionsThrow extends Options {
      nothrow?: false | undefined;
    }

    /** Options for which() async API */
    export interface AsyncOptions {
      /** If true, return all matches, instead of just the first one. Note that this means the function returns an array of strings instead of a single string. */
      all?: boolean | undefined;
      /** Use instead of the PATH environment variable. */
      path?: string | undefined;
      /** Use instead of the PATHEXT environment variable. */
      pathExt?: string | undefined;
    }

    /** Options for which() sync and async APIs */
    export interface Options extends AsyncOptions {
      /** If true, returns null when not found */
      nothrow?: boolean | undefined;
    }
  }

  export = which;
}
