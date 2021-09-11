/// <reference types="node" />
import { URL } from 'url'
import Module from 'module'

export interface EsrunTransformResult {
  source: string
  map?: string
}

export interface TransformModuleInput {
  source: string | Buffer
  pathName: string
  url: string
  bundle: boolean
}

export interface TransformCommonJSInput {
  source: string | Buffer
  pathName: string
}

export interface EsrunLoader {
  format: string

  transformModule?: (input: TransformModuleInput) => Promise<EsrunTransformResult> | EsrunTransformResult

  transformCommonJS?: (input: TransformCommonJSInput) => EsrunTransformResult

  loadCommonJS?: (modle: Module, pathName: string) => any
}

export declare const loaders: Record<string, EsrunLoader | null>

export declare function addMainEntry(pathName: string | Module): void

export declare function handleUncaughtError(error: any): void

export declare function emitUncaughtError(error: any): void

export declare function registerSourceMapSupport(): boolean

export declare function register(): boolean

export declare function isRegistered(): boolean

export declare function setFileSourceMap(url: string, sourcePath: string | null, map: string): void

export interface RegisterLoaderArgument {
  extension: string
  loader: string | EsrunLoader
  extensionless?: boolean
}

export declare function registerLoader(arg: Readonly<RegisterLoaderArgument> | Readonly<RegisterLoaderArgument>[]): void

export declare function resolveEsModule(
  id: string | URL,
  sourcefile?: string | URL | null | undefined
): string | Promise<string>

export declare function clearResolveEsModuleCache()

export declare function pathNameFromUrl(fileOrUrl: string | URL | null | undefined): string | undefined

export declare function pathNameToUrl(fileOrUrl: string | URL | null | undefined): string | undefined

/**
 * Gets the url of the file where this function was called.
 * @param caller The optional caller function to use to idenfity the file where this function was called
 */
export declare function getCallerFileUrl(caller?: Function | null | undefined): string | undefined

/**
 * Gets the full path of the file where this function was called.
 * @param caller The optional caller function to use to idenfity the file where this function was called
 */
export declare function getCallerFilePath(caller?: Function | null | undefined): string | undefined

export interface EvalModuleOptions {
  format?: string
  bundle?: boolean
  extension?: string
  isMain?: boolean
}

export declare function esrunEval(sourceCode, options?: EvalModuleOptions): Promise<any>

export declare function makePathRelative(filePath: string, cwd?: string): string

/** Converts a value to boolean */
export declare function toBoolean(value: unknown): boolean

/** True if running inside Continuous Integration */
export declare let isCI: boolean

/** Gets isCI property */
export declare function getIsCI(): boolean

/** Sets isCI property */
export declare function setIsCI(value: unknown): void
