import { devError } from './dev-error'
import { devLog, getProcessTitle, setProcessTitle } from './dev-log'
import { PromiseWithoutError } from './types'

/** Runs lists of functions or promises in sequence */
export async function runSequential(...functionsOrPromises: unknown[]): Promise<void> {
  for (let p of functionsOrPromises) {
    if (typeof p === 'function') {
      p = p()
    }
    if (!p || typeof p === 'number' || typeof p === 'boolean' || typeof p === 'string') {
      continue
    }
    if (typeof (p as any).then === 'function') {
      p = await p
    }
    if (typeof p === 'object' && p !== null && Symbol.iterator in (p as any)) {
      await runSequential(...(p as any))
    }
  }
}

/** Runs lists of functions or promises in parallel */
export async function runParallel(...functionsOrPromises: unknown[]): Promise<void> {
  let error
  const promises: Promise<void>[] = []

  const handlePromise = async (p: any) => {
    try {
      if (typeof p === 'function') {
        p = p()
      }
      if (!p || typeof p === 'number' || typeof p === 'boolean' || typeof p === 'string') {
        return undefined
      }
      if (typeof (p as any).then === 'function') {
        p = await p
      }
      if (typeof p === 'object' && p !== null && Symbol.iterator in (p as any)) {
        for (const q of p) {
          promises.push(handlePromise(q))
        }
      }
    } catch (e) {
      devLog.errorOnce(e)
    }
    return p
  }

  for (const p of functionsOrPromises) {
    promises.push(handlePromise(p))
  }

  await Promise.all(promises)
  if (error) {
    throw error
  }
}

/** Asynchronous delay. Returns a promise that is resolved after some time. */
export const asyncDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Top level run of functions and promises */
export function devRunMain<T = unknown>(
  main: { exports: () => T | Promise<T> } | (() => T | Promise<T>) | T,
  processTitle?: string
): PromiseWithoutError<T | Error> {
  let handledError: Error | undefined

  const devRunMainError = (error: any) => {
    if (handledError !== error) {
      handledError = error
      error = devError(error, devRunMain)
      devError.handleUncaughtException(error)
    } else if (!(error instanceof Error)) {
      error = devError(error, devRunMain)
    }
    return error
  }

  let promise: Promise<any> | null = null

  try {
    devError.initErrorHandling()
    devLog.initProcessTime()

    if (processTitle) {
      setProcessTitle(processTitle)
    } else if (typeof main === 'object' && main !== null && !getProcessTitle.hasProcessTitle()) {
      setProcessTitle(main as any)
    }

    devLog.printProcessBanner()

    if (!main) {
      return main as any
    }

    if (main !== null && typeof main === 'object') {
      if ('exports' in main) {
        main = main.exports
      }
    }

    let result
    if (typeof main === 'function') {
      result = (main as any)()
    }

    if (typeof result === 'object' && result !== null) {
      if (typeof result.catch === 'function') {
        promise = result.catch(devRunMainError)
      } else if (typeof result.then === 'function') {
        promise = result.then((x: any) => x, devRunMainError)
      }
    }
    promise = Promise.resolve(result)
  } catch (error) {
    if (!promise) {
      promise = Promise.resolve(devRunMainError(error))
    }
  }

  return promise
}
