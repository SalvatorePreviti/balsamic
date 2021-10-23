import Module from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { PackageJson, TsConfig } from '../types'
import { toUTF8 } from '../lib/utils'

const ABSOLUTE_OR_RELATIVE_PATH_REGEX = /^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/
const NODE_MODULES_CASE_INSENSITIVE_REGEX = /^node_modules$/i

export abstract class NodeFsEntry {
  #stats: fs.Stats | boolean | null

  /** The full absolute path */
  public readonly path: string

  /** The basename of the path */
  public readonly basename: string

  /** The NodeResolver instance that owns this entry */
  public abstract get resolver(): NodeResolver

  /** The parent directory of this file or directory */
  public abstract get parentDirectory(): NodeDirectory

  /** True if this is an instance of NodeFile */
  public abstract get isFile(): boolean

  /** True if this is a NodeJsonFile instance */
  public abstract get isJSONFile(): boolean

  /** True if this is a NodePackageJsonFile instance */
  public abstract get isPackageJsonFile(): boolean

  /** True if this is an instance of NodeDirectory */
  public abstract get isDirectory(): boolean

  /** True if this entry is a root directory (parentDirectory === this) */
  public abstract get isRootDirectory(): boolean

  /** The relative node require for the given directory */
  public abstract get require(): NodeRequire

  /** Gets the package.json for this or a parent folder of this. */
  public abstract get packageJsonFile(): NodePackageJsonFile | null

  public get stats(): fs.Stats | null {
    const stats = this.#stats
    return stats === true ? (this.#stats = fs_tryLstatSync(this.path)) : stats === false ? null : stats
  }

  public constructor(fileOrDirectoryPath: string, basename: string, stats: fs.Stats | boolean) {
    this.path = fileOrDirectoryPath
    this.basename = basename
    this.#stats = stats
  }

  /** Resolves a NodeJS module. Returns null if not found. */
  public resolveCommonJS(id: string): string | null {
    try {
      return this.require.resolve(id)
    } catch (_) {
      return null
    }
  }

  /** Resolves a module package.json from this directory. Returns null if a package is not found. */
  public abstract resolvePackage(id: string): NodePackageJsonFile | null

  public toString() {
    return this.path
  }
}

export type NodeFileOrDirectory = NodeFile | NodeDirectory

export class NodeFile extends NodeFsEntry {
  public readonly parentDirectory: NodeDirectory

  /** The NodeResolver instance that owns this file. */
  public get resolver(): NodeResolver {
    return this.parentDirectory.resolver
  }

  /** Always true, this is a file. */
  public get isFile(): true {
    return true
  }

  /** True if this is a NodeJsonFile instance */
  public get isJSONFile(): boolean {
    return false
  }

  /** True if this is a NodePackageJsonFile instance */
  public get isPackageJsonFile(): boolean {
    return false
  }

  /** Always false, this is a file. */
  public get isDirectory(): false {
    return false
  }

  /** Always false, this is a file. */
  public get isRootDirectory(): false {
    return false
  }

  /** The node require function for the directory that owns this file. */
  public get require(): NodeRequire {
    return this.parentDirectory.require
  }

  /** Gets the package.json for this file or a parent folder of this file. */
  public get packageJsonFile(): NodePackageJsonFile | null {
    return this.parentDirectory.packageJsonFile
  }

  public constructor(parentDirectory: NodeDirectory, filePath: string, basename: string, stats: fs.Stats | boolean) {
    super(filePath, basename, stats)
    this.parentDirectory = parentDirectory
  }

  /** Resolves a module package.json from this directory. Returns null if a package is not found. */
  public resolvePackage(id: string): NodePackageJsonFile | null {
    return this.parentDirectory.resolvePackage(id)
  }
}

export class NodeJsonFile<Type = any> extends NodeFile {
  #json: Type | this | undefined = undefined

  /** Always true */
  public get isJSONFile(): true {
    return true
  }

  /** Gets the content of the deserialized JSON file */
  public get json(): Type | undefined {
    let json = this.#json as any
    if (json === undefined) {
      json = this.loadJSON() as any
      this.#json = json
    }
    return json === this ? undefined : json
  }

  public set json(value: Type | undefined) {
    this.#json = value
  }

  protected loadJSON(): Type | undefined {
    const fullFilePath = this.path
    const cache = this.resolver.requireCache
    const cached = cache[fullFilePath]
    if (cached) {
      return cached.exports
    }
    try {
      const parsed = JSON.parse(toUTF8(fs.readFileSync(this.path, 'utf8'))) // TODO: parse JSONC
      const module = new Module(fullFilePath)
      module.filename = fullFilePath
      module.loaded = true
      module.paths = [path.dirname(fullFilePath)]
      cache[fullFilePath] = module
      return parsed
    } catch (_) {}

    return undefined
  }
}

export class NodePackageJsonFile extends NodeJsonFile<PackageJson> {
  #packageName: string | undefined = undefined

  /** Gets the parent package.json file of this package.json file */
  public get parentPackageJsonFile(): NodePackageJsonFile | null {
    const packageJsonFile = this.parentDirectory.parentDirectory.packageJsonFile
    return packageJsonFile && packageJsonFile !== this ? packageJsonFile : null
  }

  /** Always true */
  public get isPackageJsonFile(): true {
    return true
  }

  /** Returns always this. */
  public get packageJsonFile(): this {
    return this
  }

  /** The name of the package. */
  public get packageName(): string {
    const json = this.json
    if (json) {
      const name = json.name
      if (name) {
        return name
      }
    }
    let result = this.#packageName
    if (result !== undefined) {
      return result
    }
    const p = this.parentDirectory
    const pp = p.parentDirectory
    result = p !== pp && pp.basename.startsWith('@') ? `${pp.basename}/${p.basename}` : p.basename
    this.#packageName = result
    return result
  }

  public set packageName(value: string | undefined) {
    this.#packageName = value
  }

  /** Resolves the bin executable of a package */
  public resolvePackageBin(moduleId: string, executableId?: string): string | null {
    const json = this.json
    if (json) {
      const { bin } = json
      if (bin) {
        const binFile = typeof bin === 'string' ? bin : bin[executableId || this.basename]
        if (binFile) {
          return this.parentDirectory.resolveCommonJS(path.resolve(this.parentDirectory.path, binFile))
        }
      }
    }
    return this.parentDirectory.resolveCommonJS(`${moduleId}/${executableId}`)
  }

  protected loadJSON(): PackageJson | undefined {
    const result = super.loadJSON()
    return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : undefined
  }
}

export class NodeTsconfigFile extends NodeJsonFile<TsConfig> {
  protected loadJSON(): TsConfig | undefined {
    const result = super.loadJSON()
    return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : undefined
  }
}

export class NodeDirectory extends NodeFsEntry {
  public readonly resolver: NodeResolver
  public readonly parentDirectory: NodeDirectory

  #require: NodeRequire | null = null
  #packageJsonFile: NodePackageJsonFile | null | undefined = undefined
  #tsconfigFile: NodeTsconfigFile | null | undefined = undefined

  public constructor(
    resolver: NodeResolver,
    parentDirectory: NodeDirectory | null,
    directoryPath: string,
    basename: string,
    stats: fs.Stats | boolean
  ) {
    super(directoryPath, basename, stats)
    this.resolver = resolver
    this.parentDirectory = parentDirectory || this
  }

  /** Always false, this is a directory, not a file. */
  public get isFile(): false {
    return false
  }

  /** Always false, this is a directory, not a file. */
  public get isPackageJsonFile(): false {
    return false
  }

  /** Always false, this is a directory, not a JSON file. */
  public get isJSONFile(): false {
    return false
  }

  /** Always true, this is a directory. */
  public get isDirectory(): true {
    return true
  }

  /** True if this directory is a root directory (parentDirectory === this) */
  public get isRootDirectory(): boolean {
    return this.parentDirectory === this
  }

  /** Finds a file given a relative path */
  public getFile(relativePath: string, options?: { findInParents?: boolean }): NodeFile | null {
    const found = this.resolver.getFile(path.resolve(this.path, relativePath))
    return !found && options && options.findInParents && !this.isRootDirectory
      ? this.parentDirectory.getFile(relativePath, options)
      : found
  }

  /** Gets the package.json for this or a parent folder of this folder. */
  public get packageJsonFile(): NodePackageJsonFile | null {
    let result = this.#packageJsonFile
    if (result === undefined) {
      result =
        (this.getFile('package.json') as NodePackageJsonFile | null) ||
        (this.isRootDirectory ? null : this.parentDirectory.packageJsonFile)
      this.#packageJsonFile = result
    }
    return result
  }

  /** Gets the tsconfig.json for this or a parent folder of this folder. */
  public get tsconfigFile(): NodeTsconfigFile | null {
    let result = this.#tsconfigFile
    if (result === undefined) {
      result =
        (this.getFile('package.json') as NodeTsconfigFile | null) ||
        (this.isRootDirectory ? null : this.parentDirectory.tsconfigFile)
      this.#tsconfigFile = result
    }
    return result
  }

  /** The node require function for this directory. */
  public get require(): NodeRequire {
    return this.#require || (this.#require = Module.createRequire(path.join(this.path, '_')))
  }

  /** Resolves a NodeJS module. Returns null if not found. */
  public resolveCommonJS(id: string): string | null {
    try {
      return this.require.resolve(id)
    } catch (_) {
      return null
    }
  }

  /** Resolves a module package.json from this directory. Returns null if a package is not found. */
  public resolvePackage(id: string): NodePackageJsonFile | null {
    if (id === '.' || id === '') {
      return this.packageJsonFile
    }
    if (ABSOLUTE_OR_RELATIVE_PATH_REGEX.test(id)) {
      const p = path.resolve(this.path, id)
      return (this.resolver.getFile(path.resolve(p, 'package.json')) ||
        (path.basename(p) === 'package.json' ? this.resolver.getFile(p) : null)) as NodePackageJsonFile | null
    }
    let current: NodeDirectory = this
    do {
      const endsWithNodeModules = NODE_MODULES_CASE_INSENSITIVE_REGEX.test(current.basename)
      const filePath = endsWithNodeModules
        ? path.join(current.path, id, 'package.json')
        : path.join(current.path, 'node_modules', id, 'package.json')
      const packageJson = this.resolver.getFile(filePath)
      if (packageJson) {
        return packageJson as NodePackageJsonFile
      }
      current = current.parentDirectory
      if (endsWithNodeModules) {
        current = current.parentDirectory
      }
    } while (!current.isRootDirectory)
    const thisPackage = this.packageJsonFile
    return thisPackage && thisPackage.packageName === id ? thisPackage : null
  }

  /** Resolves the bin executable of a package */
  public resolvePackageBin(moduleId: string, executableId?: string): string | null {
    const pkg = this.packageJsonFile
    return pkg ? pkg.resolvePackageBin(moduleId, executableId) : null
  }
}

export class NodeResolver {
  public static default: NodeResolver = new NodeResolver()

  readonly #entries = new Map<string, NodeDirectory | NodeFile | null>()
  #requireCache: Record<string, NodeModule> | null = (Module as any)._cache || Object.create(null)

  #projectPath: string
  #projectDirectory: NodeDirectory | null | undefined = undefined

  public constructor(cwd: string = process.cwd()) {
    this.#projectPath = path.resolve(cwd)
  }

  public get requireCache() {
    return this.#requireCache || (this.#requireCache = (module as any)._cache || Object.create(null))
  }

  public set requireCache(value: Record<string, NodeModule>) {
    this.#requireCache = value
  }

  public get projectPath(): string {
    return this.#projectPath
  }

  public set projectPath(value: string) {
    value = path.resolve(value)
    const directory = this.getDirectory(value)
    this.#projectDirectory = directory
    this.#projectPath = directory ? directory.path : value
  }

  public get projectDirectory(): NodeDirectory | null {
    return this.#projectDirectory || (this.#projectDirectory = this.getDirectory(this.projectPath))
  }

  public pathResolve(p: string | URL): string {
    return path.resolve(this.projectPath, typeof p !== 'string' || /^file:\/\//i.test(p) ? fileURLToPath(p) : p)
  }

  public getFileOrDirectory(fileOrDirectoryPath: string | URL): NodeDirectory | NodeFile | null {
    const unrealpath = this.pathResolve(fileOrDirectoryPath)
    let result = this.#entries.get(unrealpath)
    if (result === undefined) {
      result = this.#loadFileOrDirectory(unrealpath)
    }
    return result
  }

  public getPackageJsonFile(fileOrDirectoryPath: string | URL): NodePackageJsonFile | null {
    const directory = this.getDirectoryOrFileDirectory(fileOrDirectoryPath)
    return directory ? directory.packageJsonFile : null
  }

  public getDirectoryOrFileDirectory(fileOrDirectoryPath: string | URL): NodeDirectory | null {
    const result = this.getFileOrDirectory(fileOrDirectoryPath)
    return result ? (result.isDirectory ? result : result.parentDirectory) : null
  }

  public getDirectory(directoryPath: string | URL): NodeDirectory | null {
    const result = this.getFileOrDirectory(directoryPath)
    return result && result.isDirectory ? result : null
  }

  public getFile(filePath: string | URL): NodeFile | null {
    const result = this.getFileOrDirectory(filePath)
    return result && result.isFile ? result : null
  }

  public getRealPath(filePath: string | URL): string | null {
    const fileOrDirectory = this.getFileOrDirectory(filePath)
    return fileOrDirectory ? fileOrDirectory.path : null
  }

  public getRealDirectoryPath(directoryPath: string | URL): string | null {
    const directory = this.getDirectory(directoryPath)
    return directory ? directory.path : null
  }

  public getRealFilePath(filePath: string | URL): string | null {
    const file = this.getFile(filePath)
    return file ? file.path : null
  }

  /** Resolve the path of commonJS module from the given directory */
  public resolveCommonJS(id: string, cwd?: string | URL | null | undefined): string | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory
    return directory && directory.resolveCommonJS(id)
  }

  /** Resolve the package.json of the given package from the given directory */
  public resolvePackage(id: string, cwd?: string | URL | null | undefined): NodePackageJsonFile | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory
    return directory && directory.resolvePackage(id)
  }

  /** Resolves the bin executable of a package */
  public resolvePackageBin(
    moduleId: string,
    executableId?: string,
    cwd?: string | URL | null | undefined
  ): string | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory
    return directory ? directory.resolvePackageBin(moduleId, executableId) : null
  }

  #loadFileOrDirectory(
    unrealpath: string,
    realpath?: string | null,
    isDirectory?: boolean
  ): NodeDirectory | NodeFile | null {
    realpath = this.requireCache[unrealpath] ? realpath : fs_tryRealpathSync(unrealpath)
    if (!realpath) {
      this.#entries.set(unrealpath, null)
      return null
    }
    const stats = !!isDirectory || fs_tryLstatSync(realpath)
    let result: NodeDirectory | NodeFile | null = null
    if (stats) {
      let parent: NodeDirectory | null | undefined
      const parentPath = path.dirname(realpath)
      if (!parentPath || parentPath === realpath) {
        parent = null
      } else {
        const foundParent = this.#entries.get(parentPath)
        parent =
          foundParent && foundParent.isDirectory
            ? foundParent
            : (this.#loadFileOrDirectory(parentPath, parentPath, true) as NodeDirectory)
      }
      const basename = path.basename(realpath)
      realpath = path.resolve(parentPath, basename)
      if (stats === true || stats.isDirectory()) {
        result = this.newNodeDirectory(parent, realpath, basename, stats)
      } else if (stats.isFile() && parent) {
        result = this.newNodeFile(parent, realpath, basename, stats)
      }
    }
    this.#entries.set(realpath, result)
    this.#entries.set(unrealpath, result)
    return result
  }

  protected newNodeDirectory(
    parent: NodeDirectory | null,
    realDirectoryPath: string,
    basename: string,
    stats: fs.Stats | boolean
  ): NodeDirectory {
    return new NodeDirectory(this, parent, realDirectoryPath, basename, stats)
  }

  protected newNodeFile(
    parent: NodeDirectory,
    filePath: string,
    basename: string,
    stats: fs.Stats | boolean
  ): NodeFile | null {
    const name = basename.toLowerCase()
    if (name === 'package.json') {
      return new NodePackageJsonFile(parent, filePath, basename, stats)
    }
    if (name === 'tsconfig.json') {
      return new NodeTsconfigFile(parent, filePath, basename, stats)
    }
    if (name.endsWith('.json') || name.endsWith('.jsonc')) {
      return new NodeJsonFile(parent, filePath, basename, stats)
    }
    return new NodeFile(parent, filePath, basename, stats)
  }
}

function fs_tryRealpathSync(unrealpath: string): string | null {
  try {
    return fs.realpathSync.native(unrealpath)
  } catch (_) {
    return null
  }
}

function fs_tryLstatSync(realpath: string): fs.Stats | null {
  try {
    return fs.lstatSync(realpath, { bigint: false, throwIfNoEntry: false }) || null
  } catch (_) {}
  return null
}
