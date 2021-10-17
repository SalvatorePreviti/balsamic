import { fileURLToPath } from 'url'
import _resolvePackagePath from 'resolve-package-path'
import Module from 'module'
import path from 'path'

export function resolveModulePackageJson(moduleId: string, cwd?: string | URL | null | undefined): string | null {
  if (!cwd) {
    cwd = process.cwd()
  } else if (typeof cwd !== 'string') {
    cwd = path.resolve(fileURLToPath(cwd))
  } else {
    cwd = path.resolve(cwd)
  }
  return _resolvePackagePath(moduleId, cwd)
}

export function resolveModuleBin(moduleId: string, executableId: string, cwd?: string | URL): string {
  const packageJsonPath = resolveModulePackageJson.forced(moduleId, cwd)
  const req = Module.createRequire(packageJsonPath)
  const { bin } = req(packageJsonPath)
  if (bin) {
    const binFile = bin[executableId]
    if (binFile) {
      return req.resolve(path.resolve(path.dirname(packageJsonPath), binFile))
    }
  }
  return req(`${moduleId}/${executableId}`)
}

resolveModulePackageJson.forced = (moduleId: string, cwd?: string | URL | null | undefined): string => {
  const resolved = resolveModulePackageJson(moduleId, cwd)
  if (!resolved) {
    const error = new Error(`Cannot find module '${moduleId}'`)
    error.code = 'MODULE_NOT_FOUND'
    error.requireStack = []
    throw error
  }
  return resolved
}
