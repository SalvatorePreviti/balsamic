import type { PackageJson } from '../types'
import path from 'path'
import { NodeResolver } from './node-resolver'
import { NodePackageJsonFile } from '.'

export interface GetPackagesFoldersOptions {
  /** If true, packages hosted inside a package node_modules will not be returned. Default is true. */
  topLevelOnly?: boolean

  /** If true, modules with the same id will be unified. Useful for building an hoisted node_modules folder. Default is false. */
  unique?: boolean

  /** An optional callback to check if a package can be included or not. */
  filter?: (pkg: NodePackageJsonFile) => boolean
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
  options: GetPackagesFoldersOptions = {},
  resolver: NodeResolver = NodeResolver.default
): PackagesFolderResult {
  interface QueueEntry {
    parent: NodePackageJsonFile
    file: NodePackageJsonFile
  }

  const exclusion = new Set<NodePackageJsonFile>()
  const packagesLevels = new Map<NodePackageJsonFile, number>()
  const inputPackages = new Map<NodePackageJsonFile, Required<PackagesFolderInput>>()
  const queueEntries = new Set<string>()
  const queue: QueueEntry[] = []
  let queuePosition: number = 0

  const filter = options.filter
  const canIncludePackage = (pkg: NodePackageJsonFile): boolean =>
    !!pkg.json && !exclusion.has(pkg) && (!filter || filter(pkg))

  const enqueueDependency = (parent: NodePackageJsonFile, id: string) => {
    const key = `${parent.path}*${id}`
    if (!queueEntries.has(key)) {
      queueEntries.add(key)
      if (packagesLevels.get(parent) === 0 || canIncludePackage(parent)) {
        const file = parent.resolvePackage(id)
        if (file) {
          queue.push({ parent, file })
        }
      }
    }
  }

  const enqueueDependencies = (parent: NodePackageJsonFile, entries: Record<string, unknown> | undefined | false) => {
    if (typeof entries === 'object' && entries !== null && !Array.isArray(entries)) {
      for (const key of Object.keys(entries).sort()) {
        enqueueDependency(parent, key)
      }
    }
  }

  const enqueuePackage = (file: NodePackageJsonFile, level: number) => {
    const oldLevel = packagesLevels.get(file)
    if (oldLevel === undefined) {
      packagesLevels.set(file, level)
      const json = file.json
      if (json && canIncludePackage(file) && level > 0) {
        enqueueDependencies(file, json.dependencies)
        enqueueDependencies(file, json.peerDependencies)
        enqueueDependencies(file, json.optionalDependencies)
      }
    } else if (level < oldLevel) {
      packagesLevels.set(file, level)
    }
  }

  const addInput = (inputItem: string | Readonly<PackagesFolderInput>) => {
    if (typeof inputItem === 'string') {
      inputItem = { path: inputItem }
    }
    const file = resolver.getPackageJsonFile(inputItem.path)
    if (file && !inputPackages.has(file)) {
      const inputEntry: Required<PackagesFolderInput> = {
        path: file.parentDirectory.path,
        include: !!inputItem.include,
        dependencies: !!inputItem.dependencies || inputItem.dependencies === undefined,
        devDependencies: !!inputItem.devDependencies,
        peerDependencies: !!inputItem.peerDependencies || inputItem.peerDependencies === undefined,
        optionalDependencies: !!inputItem.optionalDependencies || inputItem.optionalDependencies === undefined
      }
      if (!inputEntry.include) {
        exclusion.add(file)
      }
      inputPackages.set(file, inputEntry)
      enqueuePackage(file, 0)
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
    enqueueDependencies(folder, inputEntry.dependencies && folder.json?.dependencies)
  }
  for (const [folder, inputEntry] of inputPackages) {
    enqueueDependencies(folder, inputEntry.devDependencies && folder.json?.devDependencies)
  }
  for (const [folder, inputEntry] of inputPackages) {
    enqueueDependencies(folder, inputEntry.peerDependencies && folder.json?.peerDependencies)
  }
  for (const [folder, inputEntry] of inputPackages) {
    enqueueDependencies(folder, inputEntry.optionalDependencies && folder.json?.optionalDependencies)
  }

  while (queuePosition < queue.length) {
    while (queuePosition < queue.length) {
      const entry = queue[queuePosition++]
      enqueuePackage(entry.file, (packagesLevels.get(entry.parent) || 0) + 1)
    }

    for (const pkg of packagesLevels.keys()) {
      for (const inputPackage of inputPackages.keys()) {
        if (inputPackage !== pkg && canIncludePackage(pkg)) {
          enqueueDependency(inputPackage, pkg.packageName)
        }
      }
    }
  }

  let collectedPackages = Array.from(packagesLevels.keys()).filter(canIncludePackage)

  if (options.unique) {
    const uniqueByName = new Map<string, NodePackageJsonFile>()
    for (const pkg of collectedPackages) {
      const found = uniqueByName.get(pkg.packageName)
      if (!found || packagesLevels.get(pkg)! < packagesLevels.get(found)!) {
        uniqueByName.set(pkg.packageName, pkg)
      }
    }
    collectedPackages = Array.from(uniqueByName.values())
  }

  let result: PackagesFoldersEntry[] = collectedPackages.map((pkg) => ({
    directory: pkg.parentDirectory.path,
    name: pkg.packageName,
    manifest: pkg.json!
  }))

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
          item.parent = found
          ++nonTopLevelCount
          break
        }
        current = parent
      }
    }
  }

  if (nonTopLevelCount > 0 && (!!options.topLevelOnly || options.topLevelOnly === undefined)) {
    result = result.filter((item) => !item.parent)
  }

  return { items: result }
}
