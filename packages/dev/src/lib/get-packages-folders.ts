import type { PackageJson } from './types'
import { toUTF8 } from './utils'
import fs from 'fs'
import path from 'path'
import { resolveModulePackageJson } from './resolve'

export interface GetPackagesFoldersOptions {
  /** If true, packages hosted inside a package node_modules will not be returned. Default is true. */
  topLevelOnly?: boolean

  /** If true, modules with the same id will be unified. Useful for building an hoisted node_modules folder. Default is false. */
  unique?: boolean

  /** List of package names or full path to exclude. If a package is excluded, its dependencies are not processed as well. Default is empty. */
  exclude?: Iterable<string> | string | null | undefined
}

export interface PackagesFolderInput {
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

export interface PackagesFoldersEntry {
  /** Path of the directory of the package */
  directory: string

  /** The name of the package */
  name: string

  /** The package manifest */
  manifest: PackageJson

  /** The directory of the module that has this module in its node_modules */
  parent?: string
}

export interface PackagesFolderResult {
  /** Input provided */
  input: Required<PackagesFolderInput>[]

  /** Options passed to getPackagesFolders function */
  options: Required<GetPackagesFoldersOptions>

  /** List of packages */
  items: PackagesFoldersEntry[]
}

/**
 * Queries package.json and node_modules for finding all packages needed
 * @param input The packages to introspect
 * @param options The custom options
 * @returns An object that contains a list of packages and their manifest
 */
export function getPackagesFolders(
  input: string | Readonly<PackagesFolderInput> | Iterable<PackagesFolderInput | string | null | undefined>,
  options: GetPackagesFoldersOptions = {}
): PackagesFolderResult {
  interface Package {
    directory: string
    name: string
    manifest: any
    include: number
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

  const exclusion = new Set<string>()
  if (options.exclude) {
    if (typeof options.exclude === 'string') {
      exclusion.add(options.exclude)
    } else {
      for (const item of options.exclude) {
        exclusion.add(item)
      }
    }
  }

  const getPackage = (packageJsonPath: string): Package => {
    let folder = packageFolders.get(packageJsonPath)
    if (folder === undefined) {
      folder = {
        directory: path.dirname(packageJsonPath),
        manifest: undefined,
        name: '',
        include: 1
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
      if (
        pkg.include !== -1 &&
        (exclusion.has(pkg.name) || exclusion.has(manifestPath) || exclusion.has(pkg.directory))
      ) {
        pkg.include = -1
      }
    }
    return pkg.manifest
  }

  const enqueueManifestDependencies = (pkg: Package, dependencies: unknown, required: boolean) => {
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) {
      return
    }
    for (const id of Object.keys(dependencies).sort()) {
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

  const inputPackages = new Map<Package, Required<PackagesFolderInput>>()

  const addInput = (inputItem: string | Readonly<PackagesFolderInput>) => {
    if (typeof inputItem === 'string') {
      inputItem = { path: inputItem }
    }

    let packageJsonPath = path.resolve(inputItem.path)
    if (path.basename(packageJsonPath).toLowerCase() !== 'package.json') {
      packageJsonPath = path.resolve(packageJsonPath, 'package.json')
    }
    const folder = getPackage(packageJsonPath)

    if (!inputPackages.has(folder)) {
      const inputEntry: Required<PackagesFolderInput> = {
        path: folder.directory,
        required: !!inputItem.required || inputItem.required === undefined,
        include: !!inputItem.include,
        dependencies: !!inputItem.dependencies || inputItem.dependencies === undefined,
        bundledDependencies: inputItem.bundledDependencies || inputItem.bundledDependencies === undefined,
        devDependencies: !!inputItem.devDependencies,
        peerDependencies: !!inputItem.peerDependencies || inputItem.peerDependencies === undefined,
        optionalDependencies: !!inputItem.optionalDependencies || inputItem.optionalDependencies === undefined
      }

      folder.include = inputEntry.include ? 1 : 0
      inputPackages.set(folder, inputEntry)
      getManifest(folder, inputEntry.required)
    }
  }

  if (typeof input === 'string') {
    addInput(input)
  } else if (Symbol.iterator in input) {
    for (const inputItem of input as Iterable<string | Readonly<PackagesFolderInput>>) {
      if (inputItem !== null && inputItem !== undefined) {
        addInput(inputItem)
      }
    }
  } else {
    addInput(input as string | Readonly<PackagesFolderInput>)
  }

  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.dependencies) {
      enqueueManifestDependencies(folder, folder.manifest.dependencies, true)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.bundledDependencies) {
      enqueueManifestDependencies(folder, folder.manifest.bundledDependencies, true)
      enqueueManifestDependencies(folder, folder.manifest.bundleDependencies, true)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.devDependencies) {
      enqueueManifestDependencies(folder, folder.manifest.devDependencies, true)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.peerDependencies) {
      enqueueManifestDependencies(folder, folder.manifest.peerDependencies, false)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.optionalDependencies) {
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
        if (manifest && folder.include >= 0) {
          enqueueManifestDependencies(folder, manifest.dependencies, true)
          enqueueManifestDependencies(folder, manifest.peerDependencies, false)
          enqueueManifestDependencies(folder, manifest.optionalDependencies, false)
        }
      }
    }
  }

  let result: PackagesFoldersEntry[] = []

  const unique = !!options.unique
  const topLevelOnly = !!options.topLevelOnly || options.topLevelOnly === undefined

  const uniquePackageNames = new Set<string>()
  for (const value of packageFolders.values()) {
    if (value.manifest && value.include > 0 && (!unique || !uniquePackageNames.has(value.name))) {
      uniquePackageNames.add(value.name)
      result.push({ directory: value.directory, name: value.name, manifest: value.manifest })
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
      for (let current = path.dirname(item.directory); ; ) {
        const parent = path.dirname(current)
        if (!parent || parent === current || current.length < minNodeModulesLength) {
          break
        }
        const found = nodeModulesDirectories.get(current)
        if (found !== undefined) {
          ++nonTopLevelCount
          item.parent = found
          break
        }
        current = parent
      }
    }
  }

  if (nonTopLevelCount > 0 && topLevelOnly) {
    result = result.filter((item) => !item.parent)
  }

  return {
    input: Array.from(inputPackages.values()),
    options: { topLevelOnly, unique, exclude: [...exclusion] },
    items: result
  }
}
