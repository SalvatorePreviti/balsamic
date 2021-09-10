/// <reference types="node" />
import _chalk from 'chalk'

export declare type chalk = _chalk.Chalk

export declare const chalk: typeof _chalk

export declare const INSPECT_DEPTH: number

export declare const DEV_ICON_ERROR = '\u274C'

export declare const DEV_ICON_WARNING = '\u26A0\uFE0F '

export declare const DEV_ICO_INFO = '\u2139\uFE0F '

export declare const devColorWarning: chalk

export declare const devColorRedOrange: chalk

/** True if running inside Continuous Integration */
export declare let isCI: boolean

/** Gets isCI property. Returns true if running inside Continuous Integration */
export declare function getIsCI(): boolean

/** Sets isCI property. */
export declare function setIsCI(value: unknown): void

export declare function devLogException(...args: unknown[]): void

export declare function devLogError(...args: unknown[]): void

export declare function devLogWarning(...args: unknown[]): void

export declare function devLogInfo(...args: unknown[]): void

export declare function devRunMain<T = unknown>(main: () => T | Promise<T>): Promise<T | undefined>

export declare function devGetError(
  error: any,
  caller?: Function
): Error & {
  operation?: string
  showStack?: boolean
}

export declare function devInspect(what: unknown): string

export declare function devInspectForLogging(...args: unknown[]): string

export declare function devInitErrorHandling(): boolean

export declare function devPrintOutputFileWritten(outputFilePath: string, content: string | Buffer | Uint8Array): void

export declare type PrettySizeInput = number | string | Buffer | Uint8Array | null | undefined

export interface PrettySizeOptions {
  appendBytes?: boolean
  fileType?: string
}

/** Gets a size in bytes in an human readable form. */
export declare function prettySize(bytes: PrettySizeInput, options?: PrettySizeOptions): string

export declare function makePathRelative(filePath: string, cwd?: string): string

export declare function utf8ByteLength(b: Uint8Array | Buffer | string | number | null | undefined): number

export declare function bufferToUtf8(b: Uint8Array | Buffer | string): string

export declare function handleUncaughtError(error: any): void

export declare function emitUncaughtError(error: any): void

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

/**
 * Check wether if the given module is the main module
 * @param url String url, Module or import.meta
 * @returns True if the given url, Module or import.meta is the main running module
 */
export declare function isMainModule(
  url: string | { filename: string } | { id: string } | { href: string } | { url: string } | URL | null | undefined
): boolean

export declare function addMainEntry(pathName: string | Module): void

/** Converts a value to boolean */
export declare function toBoolean(value: unknown): boolean

/** Returns true if the given value is a valid JS identifier string */
export declare function isValidIdentifier(value: unknown): value is string
