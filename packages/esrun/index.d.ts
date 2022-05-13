/// <reference types="node" />

import type { URL } from "url";
import type Module from "module";

import type _chalk from "chalk";
import type _fastglob from "fast-glob";

export interface EsrunTransformResult {
  source: string;
  map?: string;
}

export interface TransformModuleInput {
  source: string | Buffer;
  pathName: string;
  url: string;
  bundle: boolean;
}

export interface TransformCommonJSInput {
  source: string | Buffer;
  pathName: string;
}

export interface EsrunLoader {
  format: string;

  transformModule?: (input: TransformModuleInput) => Promise<EsrunTransformResult> | EsrunTransformResult;

  transformCommonJS?: (input: TransformCommonJSInput) => EsrunTransformResult;

  loadCommonJS?: (modle: Module, pathName: string) => any;
}

export declare const loaders: Record<string, EsrunLoader | null>;

export declare function addMainModule(pathName: string | Module): void;

export declare function handleUncaughtError(error: any): void;

export declare function emitUncaughtException(error: any): void;

export declare function registerSourceMapSupport(): boolean;

export interface EsrunRegisterOptions {
  esrun?: boolean;
  sourceMapSupport?: boolean;
  ignoreExperimentalWarning?: boolean;
  dotenv?: string | boolean;
  errors?: boolean;
  exit?: boolean;
}

export declare function esrunRegister(options?: EsrunRegisterOptions): void;

export declare function setFileSourceMap(url: string, sourcePath: string | null, map: string): void;

export interface RegisterLoaderArgument {
  extension: string;
  loader: string | EsrunLoader;
  extensionless?: boolean;
}

export declare function registerLoader(
  arg: Readonly<RegisterLoaderArgument> | Readonly<RegisterLoaderArgument>[],
): void;

export declare function resolveEsModule(
  id: string | URL,
  sourcefile?: string | URL | null | undefined,
): string | Promise<string>;

export declare function clearResolveEsModuleCache();

export declare function pathNameFromUrl(fileOrUrl: string | URL | null | undefined): string | undefined;

export declare function pathNameToUrl(fileOrUrl: string | URL | null | undefined): string | undefined;

/**
 * Gets the url of the file where this function was called.
 * @param caller The optional caller function to use to idenfity the file where this function was called
 */
export declare function getCallerFileUrl(caller?: Function | null | undefined): string | undefined;

/**
 * Gets the full path of the file where this function was called.
 * @param caller The optional caller function to use to idenfity the file where this function was called
 */
export declare function getCallerFilePath(caller?: Function | null | undefined): string | undefined;

export interface EvalModuleOptions {
  format?: string;
  bundle?: boolean;
  extension?: string;
  isMain?: boolean;
}

export declare function esrunEval(sourceCode, options?: EvalModuleOptions): Promise<any>;

export declare function makePathRelative(filePath: string, cwd?: string): string;

/** Converts a value to boolean */
export declare function toBoolean(value: unknown): boolean;

/** Loads .env environment variables */
export declare function loadDotEnv(dotEnvPath?: string): boolean;

export declare function resolveBuiltinModule(id: string): string | undefined;

export declare type chalk = _chalk.Chalk;

export declare const chalk: typeof _chalk;

export declare type fastglob = typeof _fastglob;

export declare const fastglob: fastglob;

export declare function devLogException(...args: unknown[]): void;

export declare function devLogError(...args: unknown[]): void;

export declare function devLogWarning(...args: unknown[]): void;

export declare function devLogInfo(...args: unknown[]): void;

export declare function devLog(...args: unknown[]): void;

export declare function devRunMain<T = unknown>(main: () => T | Promise<T>): Promise<T | undefined>;

export declare namespace devRunMain {
  export const running: boolean;
}

export declare function devGetError(
  error: any,
  caller?: Function,
): Error & {
  showStack?: boolean | "once";
};

export declare function devInspect(what: unknown): string;

export declare namespace devInspect {
  export let options: import("util").InspectOptions;
}

export declare type PrettySizeInput = number | string | Buffer | Uint8Array | null | undefined;

export interface PrettySizeOptions {
  appendBytes?: boolean;
  fileType?: string;
}

/** Gets a size in bytes in an human readable form. */
export declare function prettySize(bytes: PrettySizeInput, options?: PrettySizeOptions): string;

/**  */
export declare function utf8ByteLength(b: Uint8Array | Buffer | string | number | null | undefined): number;

/** Makes an utf8 string. Removes UTF8 BOM header if present. */
export declare function toUTF8(b: Uint8Array | Buffer | string | number | boolean | null | undefined): string;

/**
 * Check wether if the given module is the main module
 * @param url String url, Module or import.meta
 * @returns True if the given url, Module or import.meta is the main running module
 */
export declare function isMainModule(
  url: string | { filename: string } | { id: string } | { href: string } | { url: string } | URL | null | undefined,
): boolean;

/** Returns true if the given value is a valid JS identifier string */
export declare function isValidIdentifier(value: unknown): value is string;

export declare function ignoreProcessWarning(name: string, value?: boolean): void;

export declare namespace ignoreProcessWarning {
  export function isIgnored(name: string): boolean;
}

export interface NpmWorkspace {
  directory: string;
  manifest: any;
}

export interface NpmRootWorkspace extends NpmWorkspace {
  workspaces: NpmWorkspace[];
}

/** Loads a monorepo manifests and sub projects */
export declare function loadNpmWorkspace(rootDirectory?: string): Promise<NpmRootWorkspace>;
