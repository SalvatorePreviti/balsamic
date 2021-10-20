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

  /** True if production dependencies has to be included. Default is true. */
  dependencies?: boolean

  /** True if development dependencies has to be included. Default is false. */
  devDependencies?: boolean

  /** True if peer dependencies has to be included. Default is true. */
  peerDependencies?: boolean

  /** True if optional dependencies has to be included. Default is true. */
  optionalDependencies?: boolean
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
    manifest: PackageJson | null
    include: boolean
    level: number
  }

  interface QueueEntry {
    parent: Package
    id: string
    processed: boolean
  }

  const inputPackages = new Map<Package, Required<PackagesFolderInput>>()
  const packages = new Map<string, Package>()
  const queueEntries = new Map<string, QueueEntry>()
  const queue: QueueEntry[] = []
  let queuePosition: number = 0

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

  const enqueueDependency = (parent: Package, id: string): QueueEntry => {
    const key = `${parent.directory}:::${id}`
    let entry = queueEntries.get(key)
    if (!entry) {
      entry = { parent, id, processed: false }
      queueEntries.set(key, entry)
      if (parent.manifest && (parent.include || parent.level === 0)) {
        queue.push(entry)
      }
    }
    return entry
  }

  const enqueueDependencies = (parent: Package, entries: Readonly<Record<string, unknown>> | null | undefined) => {
    if (entries) {
      for (const key of Object.keys(entries).sort()) {
        enqueueDependency(parent, key)
      }
    }
  }

  const loadPackage = (packageJsonPath: string, level: number): Package => {
    let manifest: PackageJson | null = null
    try {
      manifest = JSON.parse(toUTF8(fs.readFileSync(packageJsonPath, 'utf8'))) || null
    } catch (_) {}

    const directory = path.dirname(packageJsonPath)
    const name =
      (manifest && typeof manifest.name === 'string' && manifest.name) || getPackageNameFromDirectory(directory)

    const include = !!manifest && !(exclusion.has(name) || exclusion.has(packageJsonPath) || exclusion.has(directory))

    const pkg: Package = { directory, manifest, name, include, level }
    packages.set(packageJsonPath, pkg)

    if (manifest && include && level > 0) {
      enqueueDependencies(pkg, manifest.dependencies)
      enqueueDependencies(pkg, manifest.peerDependencies)
      enqueueDependencies(pkg, manifest.optionalDependencies)
    }
    return pkg
  }

  const getPackage = (packageJsonPath: string, level: number): Package => {
    let pkg = packages.get(packageJsonPath)
    if (pkg === undefined) {
      pkg = loadPackage(packageJsonPath, level)
    } else if (level < pkg.level) {
      pkg.level = level
      packages.set(packageJsonPath, pkg)
    }
    return pkg
  }

  const resolvePackage = (parent: Package, id: string): Package | null => {
    const resolvedPackagePath = resolveModulePackageJson(id, parent.directory)
    return resolvedPackagePath ? getPackage(resolvedPackagePath, parent.level + 1) : null
  }

  const addInput = (inputItem: string | Readonly<PackagesFolderInput>) => {
    if (typeof inputItem === 'string') {
      inputItem = { path: inputItem }
    }

    let packageJsonPath = path.resolve(inputItem.path)
    if (path.basename(packageJsonPath).toLowerCase() !== 'package.json') {
      packageJsonPath = path.resolve(packageJsonPath, 'package.json')
    }
    const pkg = getPackage(packageJsonPath, 0)

    if (!inputPackages.has(pkg)) {
      const inputEntry: Required<PackagesFolderInput> = {
        path: pkg.directory,
        include: !!inputItem.include,
        dependencies: !!inputItem.dependencies || inputItem.dependencies === undefined,
        devDependencies: !!inputItem.devDependencies,
        peerDependencies: !!inputItem.peerDependencies || inputItem.peerDependencies === undefined,
        optionalDependencies: !!inputItem.optionalDependencies || inputItem.optionalDependencies === undefined
      }

      if (!inputEntry.include) {
        pkg.include = false
      }
      inputPackages.set(pkg, inputEntry)
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
      enqueueDependencies(folder, folder.manifest.dependencies)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.devDependencies) {
      enqueueDependencies(folder, folder.manifest.devDependencies)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.peerDependencies) {
      enqueueDependencies(folder, folder.manifest.peerDependencies)
    }
  }
  for (const [folder, inputEntry] of inputPackages) {
    if (folder.manifest && inputEntry.optionalDependencies) {
      enqueueDependencies(folder, folder.manifest.optionalDependencies)
    }
  }

  const unique = !!options.unique
  const topLevelOnly = !!options.topLevelOnly || options.topLevelOnly === undefined

  for (;;) {
    for (;;) {
      const entry = queuePosition < queue.length ? queue[queuePosition++] : null
      if (!entry) {
        break
      }
      if (entry.processed) {
        continue
      }
      entry.processed = true
      if (entry.parent.manifest) {
        resolvePackage(entry.parent, entry.id)
      }
    }

    for (const pkg of Array.from(packages.values())) {
      for (const inputPackage of inputPackages.keys()) {
        if (inputPackage !== pkg && pkg.include) {
          enqueueDependency(inputPackage, pkg.name)
        }
      }
    }

    if (queuePosition >= queue.length) {
      break
    }
  }

  let collectedPackages: Iterable<Package>

  if (!unique) {
    collectedPackages = packages.values()
  } else {
    const uniqueByName = new Map<string, Package>()
    for (const pkg of packages.values()) {
      if (pkg.manifest && pkg.include) {
        const found = uniqueByName.get(pkg.name)
        if (!found || pkg.level < found.level) {
          uniqueByName.set(pkg.name, pkg)
        }
      }
    }
    collectedPackages = uniqueByName.values()
  }

  let result: PackagesFoldersEntry[] = []
  for (const pkg of collectedPackages) {
    if (pkg.manifest && pkg.include) {
      result.push({ directory: pkg.directory, name: pkg.name, manifest: pkg.manifest })
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

function getPackageNameFromDirectory(directory: string): string {
  const parent = path.dirname(directory)
  const grandparent = path.dirname(parent)
  return grandparent !== parent && grandparent.startsWith('@') ? `${grandparent}/${parent}` : parent
}
