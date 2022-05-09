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

  export interface EventListenerOptions {
    capture?: boolean;
  }

  export interface AbortSignal {
    readonly aborted: boolean;

    dispatchEvent: (event: UnsafeAny) => boolean;

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
