import type { PackageJson } from './types'
import { resolveModulePackageJson, toUTF8 } from './utils'
import fs from 'fs'
import path from 'path'

export interface GetPackagesFoldersOptions {
  /** True if entries will be sorted by name and path. Default is true. */
  sort?: boolean

  /** True if the entries that are hosted inside a package node_modules should be returned or not. Default is true. */
  topLevelOnly?: boolean
}

export interface GetPackageFoldersItem {
  /** The path of the package (or package.json file) */
  path: string

  /** True if this input entry should be included in the result. Default is false. */
  include?: boolean

  /** True if this entry is required. If true and the package is not found, an error will be thrown. Default is true. */
  required?: boolean

  /** True if production dependencies has to be included. Default is true. */
  dependencies?: boolean

  /** True if development dependencies has to be included. Default is false. */
  devDependencies?: boolean

  /** True if peer dependencies has to be included. Default is true. */
  peerDependencies?: boolean

  /** True if optional dependencies has to be included. Default is true. */
  optionalDependencies?: boolean

  /** True if bundled dependencies has to be included. Default is true. */
  bundledDependencies?: boolean
}

export interface GetPackageFoldersResultItem {
  /** Path of the directory of the package */
  directory: string

  /** The name of the package */
  name: string

  /** The package manifest */
  manifest: PackageJson

  /** The directory of the module that has this module in its node_modules */
  parent?: string
}

export interface GetPackageFoldersResult {
  /** Input passed to getPackagesFolders function */
  input: GetPackageFoldersItem[]

  /** Options passed to getPackagesFolders function */
  options: GetPackagesFoldersOptions & { sort: boolean; topLevelOnly: boolean }

  /** List of packages */
  items: GetPackageFoldersResultItem[]

  /** Total number of packages processed */
  processedCount: number

  /** Total number of non top-level packages */
  nonTopLevelCount: number
}

/**
 * Queries package.json and node_modules for finding all packages needed
 * @param input The packages to introspect
 * @param options The custom options
 * @returns An object that contains a list of packages and their manifest
 */
export function getPackagesFolders(
  input: GetPackageFoldersItem[],
  options: GetPackagesFoldersOptions = {}
): GetPackageFoldersResult {
  interface Package {
    directory: string
    include: boolean
    name: string
    manifest: any
  }

  interface QueueEntry {
    parent: Package
    id: string
    required: boolean
  }

  const packageFolders = new Map<string, Package>()
  const queueEntries = new Map<string, QueueEntry>()
  const requiredQueue: QueueEntry[] = []
  const optionalQueue: QueueEntry[] = []
  let requiredQueuePosition: number = 0
  let optionalQueuePosition: number = 0

  const getPackage = (packageJsonPath: string) => {
    let folder = packageFolders.get(packageJsonPath)
    if (folder === undefined) {
      folder = {
        directory: path.dirname(packageJsonPath),
        manifest: undefined,
        name: '',
        include: true
      }
      packageFolders.set(packageJsonPath, folder)
    }
    return folder
  }

  const getManifest = (pkg: Package, required: boolean) => {
    let manifest = pkg.manifest
    if (manifest === undefined || (manifest === null && required)) {
      pkg.manifest = null
      const manifestPath = path.resolve(pkg.directory, 'package.json')
      try {
        manifest = JSON.parse(toUTF8(fs.readFileSync(manifestPath, 'utf8'))) || null
      } catch (error) {
        manifest = null
        if (required) {
          throw error
        }
      }
      if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
        throw new Error(`Invalid manifest in ${manifestPath}`)
      }
      pkg.manifest = manifest
      pkg.name = (typeof manifest.name === 'string' ? manifest.name : '') || pkg.name || path.basename(pkg.directory)
    }
    return pkg.manifest
  }

  const enqueueManifestDependencies = (pkg: Package, dependencies: unknown, required: boolean) => {
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
      return
    }
    for (const id of Object.keys(dependencies)) {
      const key = id
      let entry = queueEntries.get(key)
      if (entry) {
        if (required && !entry.required) {
          entry.required = true
          requiredQueue.push(entry)
        }
      } else {
        entry = { parent: pkg, id, required }
        ;(required ? requiredQueue : optionalQueue).push(entry)
        queueEntries.set(key, entry)
      }
    }
  }

  const inputPackages = new Map<Package, GetPackageFoldersItem>()
  for (const inputItem of input) {
    let packageJsonPath = path.resolve(inputItem.path)
    if (path.basename(packageJsonPath).toLowerCase() !== 'package.json') {
      packageJsonPath = path.resolve(packageJsonPath, 'package.json')
    }
    const folder = getPackage(packageJsonPath)
    if (!inputPackages.has(folder)) {
      folder.include = !!inputItem.include
      inputPackages.set(folder, inputItem)
      getManifest(folder, inputItem.required === undefined || !!inputItem.required)
    }
  }
  for (const [folder, inputItem] of inputPackages) {
    if (folder.manifest && (inputItem.dependencies || inputItem.dependencies === undefined)) {
      enqueueManifestDependencies(folder, folder.manifest.dependencies, true)
    }
  }
  for (const [folder, inputItem] of inputPackages) {
    if (folder.manifest && (inputItem.bundledDependencies || inputItem.bundledDependencies === undefined)) {
      enqueueManifestDependencies(folder, folder.manifest.bundledDependencies, true)
      enqueueManifestDependencies(folder, folder.manifest.bundleDependencies, true)
    }
  }
  for (const [folder, inputItem] of inputPackages) {
    if (folder.manifest && inputItem.devDependencies) {
      enqueueManifestDependencies(folder, folder.manifest.devDependencies, true)
    }
  }
  for (const [folder, inputItem] of inputPackages) {
    if (folder.manifest && (inputItem.peerDependencies || inputItem.peerDependencies === undefined)) {
      enqueueManifestDependencies(folder, folder.manifest.peerDependencies, false)
    }
  }
  for (const [folder, inputItem] of inputPackages) {
    if (folder.manifest && (inputItem.optionalDependencies || inputItem.optionalDependencies === undefined)) {
      enqueueManifestDependencies(folder, folder.manifest.optionalDependencies, false)
    }
  }

  for (;;) {
    const entry =
      requiredQueuePosition < requiredQueue.length
        ? requiredQueue[requiredQueuePosition++]
        : optionalQueuePosition < optionalQueue.length
        ? optionalQueue[optionalQueuePosition++]
        : null
    if (!entry) {
      break
    }
    const parentPanifest = getManifest(entry.parent, entry.required)
    if (parentPanifest) {
      const resolvedPackagePath = (entry.required ? resolveModulePackageJson.forced : resolveModulePackageJson)(
        entry.id,
        entry.parent.directory
      )
      if (resolvedPackagePath && !packageFolders.has(resolvedPackagePath)) {
        const folder = getPackage(resolvedPackagePath)
        const manifest = getManifest(folder, entry.required)
        if (manifest) {
          enqueueManifestDependencies(folder, manifest.dependencies, true)
          enqueueManifestDependencies(folder, manifest.peerDependencies, false)
          enqueueManifestDependencies(folder, manifest.optionalDependencies, false)
        }
      }
    }
  }

  let result: GetPackageFoldersResultItem[] = []
  for (const value of packageFolders.values()) {
    if (value.manifest && value.include) {
      result.push({
        directory: value.directory,
        name: value.name,
        manifest: value.manifest
      })
    }
  }

  const nodeModulesDirectories = new Map<string, string>()
  let minNodeModulesLength = Number.MAX_SAFE_INTEGER
  for (const item of result) {
    const nodeModulesDir = path.join(item.directory, 'node_modules')
    nodeModulesDirectories.set(nodeModulesDir, item.directory)
    minNodeModulesLength = Math.min(minNodeModulesLength, nodeModulesDir.length)
  }

  let nonTopLevelCount = 0
  for (const item of result) {
    if (!item.parent) {
      let k = path.dirname(item.directory)
      for (;;) {
        const prev = path.dirname(k)
        if (prev === k || k.length < minNodeModulesLength) {
          break
        }
        const found = nodeModulesDirectories.get(k)
        if (found !== undefined) {
          ++nonTopLevelCount
          item.parent = found
          break
        }
        k = prev
      }
    }
  }

  const topLevelOnly = !!options.topLevelOnly || options.topLevelOnly === undefined
  if (nonTopLevelCount > 0 && topLevelOnly) {
    result = result.filter((item) => !item.parent)
  }

  const sort = !!options.sort || options.sort === undefined
  if (sort) {
    result.sort((a, b) => a.name.localeCompare(b.name) || a.directory.localeCompare(b.directory))
  }

  return {
    input: [...input],
    options: { ...options, sort, topLevelOnly },
    items: result,
    nonTopLevelCount,
    processedCount: packageFolders.size
  }
}
