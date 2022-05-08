/// <reference types="node" />

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UnsafeAny = any;

export type URLLikeObject = { readonly href: string };

export type URLLike = string | Readonly<URL> | URLLikeObject;

export * from "./tsconfig-json";

export type TimeoutType = ReturnType<typeof setTimeout>;

export type IntervalType = ReturnType<typeof setInterval>;

declare global {
  export interface Event {}

  export interface Error {
    showStack?: boolean | "once" | undefined;
    [key: string]: unknown | undefined;
  }

  export interface AddEventListenerOptions {
    capture?: boolean | undefined;
    once?: boolean | undefined;
    passive?: boolean | undefined;
  }

  export interface AbortSignal {
    readonly aborted: boolean;

    addEventListener: (
      type: "abort",
      listener: (this: AbortSignal, event: UnsafeAny) => UnsafeAny,
      options?: boolean | AddEventListenerOptions,
    ) => void;

    removeEventListener: (
      type: "abort",
      listener: (this: AbortSignal, event: UnsafeAny) => UnsafeAny,
      options?: boolean | { capture?: boolean },
    ) => void;

    dispatchEvent: (event: UnsafeAny) => boolean;

    onabort: null | ((this: AbortSignal, event: UnsafeAny) => void);
  }
}

export type InterfaceFromClass<T> = {
  [P in keyof T]: T[P];
};
