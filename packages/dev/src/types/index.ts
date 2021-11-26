/// <reference types="node" />

export type URLLikeObject = { readonly href: string }

export type URLLike = string | Readonly<URL> | URLLikeObject

export * from './package-json'

export * from './tsconfig-json'

declare global {
  export interface Error {
    showStack?: boolean
    [key: string]: unknown
  }
}

export interface PromiseWithoutError<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null
  ): Promise<TResult1 | TResult2>
}

export type Awaited<T> = T extends PromiseLike<infer U> ? U : T
