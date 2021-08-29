/// <reference types="node" />
import chalk from 'chalk'

export declare const INSPECT_DEPTH: number

export declare const DEV_ICON_ERROR = '\u274C'

export declare const DEV_ICON_WARNING = '\u26A0\uFE0F '

export declare const DEV_ICO_INFO = '\u2139\uFE0F '

export declare const devColorWarning: chalk.Chalk

export declare const devColorRedOrange: chalk.Chalk

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
