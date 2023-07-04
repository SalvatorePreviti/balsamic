import type { MayHaveCustomSerialization } from "./types";

declare global {
  export interface ErrorProperties {
    /** Error class name */
    name: string;

    /** Error message */
    message: string;

    /** Error stack trace */
    stack?: string;

    /** Optional error cause */
    cause?: Error | unknown | undefined;

    /** NodeJS code, or error code */
    code?: string | number | undefined;

    /** Custom error code */
    errorCode?: string | number | undefined;

    /** If false, the stack trace will not be logged */
    showStack?: boolean | "once" | undefined;
  }

  export interface Error extends ErrorProperties, MayHaveCustomSerialization, Record<string | symbol, unknown> {}
}
