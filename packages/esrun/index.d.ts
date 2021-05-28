/// <reference types="node" />
import { URL } from 'url'
import Module from 'module'

export interface EsrunTransformResult {
  source: string
  map?: string
}

export interface EsrunLoader {
  format: string
  transformModule?: (source: string, pathName: string) => Promise<EsrunTransformResult> | EsrunTransformResult
  transformCommonJS?: (source: string, pathName: string) => EsrunTransformResult
  loadCommonJS?: (modle: Module, pathName: string) => any
}

export declare const loaders: Record<string, EsrunLoader | null>

export declare function addMainEntry(pathName: string | Module): void

export declare function handleUncaughtError(error: any): void

export declare function emitUncaughtError(error: any): void

export declare function register(): boolean

export declare function isRegistered(): boolean

/**
 * Check wether if the given module is the main module
 * @param url String url, Module or import.meta
 * @returns True if the given url, Module or import.meta is the main running module
 */
export declare function isMainModule(
  url: string | { filename: string } | { id: string } | { href: string } | { url: string } | URL | null | undefined
): boolean

export declare function setFileSourceMap(url: string, sourcePath: string | null, map: string): void

export interface RegisterLoaderArgument {
  extension: string
  loader: string | EsrunLoader
  extensionless?: boolean
}

export declare function registerLoader(arg: Readonly<RegisterLoaderArgument> | Readonly<RegisterLoaderArgument>[]): void

export declare function resolveEs6Module(
  id: string | URL,
  sourcefile?: string | URL | null | undefined
): string | Promise<string>

export declare namespace resolveEs6Module {
  var clearCache: () => void
}

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
