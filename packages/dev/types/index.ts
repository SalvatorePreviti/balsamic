/// <reference types="node" />
/* eslint-disable @typescript-eslint/no-explicit-any */

export type UnsafeAny = any;

export type URLLikeObject = { readonly href: string };

export type URLLike = string | Readonly<URL> | URLLikeObject;

export * from "./tsconfig-json";

export type TimeoutType = ReturnType<typeof setTimeout>;

export type IntervalType = ReturnType<typeof setInterval>;

declare global {
  export interface String {
    /**
     * Replace all instances of a substring in a string, using a regular expression or search string.
     * @param searchValue A string to search for.
     * @param replaceValue A string containing the text to replace for every successful match of searchValue in this string.
     */
    replaceAll(searchValue: string | RegExp, replaceValue: string): string;

    /**
     * Replace all instances of a substring in a string, using a regular expression or search string.
     * @param searchValue A string to search for.
     * @param replacer A function that returns the replacement text.
     */
    replaceAll(searchValue: string | RegExp, replacer: (substring: string, ...args: any[]) => string): string;
  }

  export interface ErrorOptions {
    cause?: Error;
  }

  export interface Error {
    showStack?: boolean | "once" | undefined;
    cause?: Error;
    [key: string]: unknown | undefined;
  }

  export interface ErrorConstructor {
    new (message?: string, options?: ErrorOptions): Error;
    (message?: string, options?: ErrorOptions): Error;
  }

  export interface EvalErrorConstructor {
    new (message?: string, options?: ErrorOptions): EvalError;
    (message?: string, options?: ErrorOptions): EvalError;
  }

  export interface RangeErrorConstructor {
    new (message?: string, options?: ErrorOptions): RangeError;
    (message?: string, options?: ErrorOptions): RangeError;
  }

  export interface ReferenceErrorConstructor {
    new (message?: string, options?: ErrorOptions): ReferenceError;
    (message?: string, options?: ErrorOptions): ReferenceError;
  }

  export interface SyntaxErrorConstructor {
    new (message?: string, options?: ErrorOptions): SyntaxError;
    (message?: string, options?: ErrorOptions): SyntaxError;
  }

  export interface TypeErrorConstructor {
    new (message?: string, options?: ErrorOptions): TypeError;
    (message?: string, options?: ErrorOptions): TypeError;
  }

  export interface URIErrorConstructor {
    new (message?: string, options?: ErrorOptions): URIError;
    (message?: string, options?: ErrorOptions): URIError;
  }

  export interface Event {}

  export interface AddEventListenerOptions {
    capture?: boolean | undefined;
    once?: boolean | undefined;
    passive?: boolean | undefined;
  }

  export interface EventListenerOptions {
    capture?: boolean;
  }

  export interface AbortSignal {
    readonly aborted: boolean;

    dispatchEvent: (event: any) => boolean;

    addEventListener(
      type: "abort",
      listener: (this: AbortSignal, ev: Event) => void,
      options?: boolean | AddEventListenerOptions,
    ): void;

    removeEventListener(
      type: "abort",
      listener: (this: AbortSignal, ev: Event) => void,
      options?: boolean | EventListenerOptions,
    ): void;
  }
}

export type InterfaceFromClass<T> = {
  [P in keyof T]: T[P];
};
