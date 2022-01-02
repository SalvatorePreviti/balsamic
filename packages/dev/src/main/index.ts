import path from 'path'
import { fileURLToPath } from 'url'
import { devEnv } from '../dev-env'
import { devError } from '../dev-error'
import { devLog } from '../dev-log'

/** Returns true if the given module (filename, module object, import.meta) is the main module running in NodeJS */
export function isMainModule(
  module:
    | string
    | URL
    | Partial<Readonly<NodeModule>>
    | { url?: string }
    | { filename?: string }
    | { href?: string }
    | false
    | null
    | undefined
) {
  if (!module) {
    return false
  }
  if (process.mainModule === module || require.main === module) {
    return true
  }
  if (typeof module === 'object') {
    module = (module as any).url || (module as any).href || (module as any).filename || (module as any).id
  }
  if (typeof module !== 'string' || !module.length) {
    return false
  }
  if (/^file:\/\//i.test(module)) {
    if (process.argv[1] === module) {
      return true
    }
    try {
      module = path.resolve(fileURLToPath(module))
    } catch (_) {}
  }
  const scriptPath = path.resolve(process.argv[1])
  return module === scriptPath || stripExt(module) === scriptPath
}

function stripExt(name: string) {
  const extension = path.extname(name)
  return extension ? name.slice(0, -extension.length) : name
}

/** Top level run of functions and promises */
export function devRunMain<T = unknown>(
  main: { exports: () => T | Promise<T> } | (() => T | Promise<T>) | Promise<T> | T,
  processTitle?: string
): Promise<T | Error>

export function devRunMain<T extends null | false | undefined>(main: T, processTitle?: string): Promise<T>

export function devRunMain<T = unknown>(main: any, processTitle?: string): Promise<T | Error> {
  let handledError: Error | undefined

  if (main === false || main === undefined || main === null) {
    return Promise.resolve(main)
  }

  function devRunMainError(error: any) {
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
      devEnv.setProcessTitle(processTitle)
    } else if (typeof main === 'object' && main !== null && !devEnv.getProcessTitle.hasProcessTitle()) {
      devEnv.setProcessTitle(main as any)
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

    let result: any
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
