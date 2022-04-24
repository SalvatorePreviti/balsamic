/// <reference types="node" />

export type URLLikeObject = { readonly href: string };

export type URLLike = string | Readonly<URL> | URLLikeObject;

export * from "./package-json";

export * from "./tsconfig-json";

declare global {
  export interface Error {
    showStack?: boolean | "once";
    [key: string]: unknown;
  }
}

export type InterfaceFromClass<T> = {
  [P in keyof T]: T[P];
};
