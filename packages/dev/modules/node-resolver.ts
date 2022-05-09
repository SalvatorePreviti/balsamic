import Module from "module";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import type { PackageJson } from "../package-json/package-json-type";
import { toUTF8 } from "../utils/utils";
import { PackageJsonParsed } from "../package-json/package-json-parsed";
import type { UnsafeAny } from "../types";

const ABSOLUTE_OR_RELATIVE_PATH_REGEX = /^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/;
const NODE_MODULES_CASE_INSENSITIVE_REGEX = /^node_modules$/i;

export type NodeFileOrDirectory = NodeFile | NodeDirectory;

export abstract class NodeFsEntry {
  private _stats: fs.Stats | undefined | null;

  /** The full absolute path */
  public readonly path: string;

  /** The basename of the path */
  public readonly basename: string;

  /** The NodeResolver instance that owns this entry */
  public abstract get resolver(): NodeResolver;

  /** The parent directory of this file or directory */
  public abstract get parentDirectory(): NodeDirectory;

  /** True if this is an instance of NodeFile */
  public abstract get isFile(): boolean;

  /** True if this is an instance of NodeDirectory */
  public abstract get isDirectory(): boolean;

  /** True if this entry is a root directory (parentDirectory === this) */
  public abstract get isRootDirectory(): boolean;

  /** The node require function for the directory, or for the directory that owns this file. */
  public abstract get nodeRequire(): NodeRequire;

  /** The path of the directory. If this is a directory, returns this.path, if this is a file, returns this.parentDirectory.path */
  public abstract get directoryPath(): string;

  /** Gets the package.json for this file or a parent folder of this file. */
  public abstract get packageJson(): NodePackageJson | null;

  public get stats(): fs.Stats | null {
    const stats = this._stats;
    return stats === undefined ? (this._stats = fs_tryStatSync(this.path)) : stats;
  }

  protected constructor(fileOrDirectoryPath: string, basename: string, stats: fs.Stats | null | undefined) {
    this.path = fileOrDirectoryPath;
    this.basename = basename;
    this._stats = stats;
  }

  /** Finds a directory given a relative path */
  public getDirectory(relativePath: string): NodeDirectory | null {
    return this.resolver.getDirectory(path.resolve(this.directoryPath, relativePath));
  }

  /** Finds a file given a relative path */
  public getFile(relativePath: string): NodeFile | null {
    return this.resolver.getFile(path.resolve(this.directoryPath, relativePath));
  }

  /** Finds a directory given a relative path. If not found in the current directory, looks in the parent directories. */
  public getFileUp(relativePath: string): NodeFile | null {
    const found = this.getFile(relativePath);
    return !found && !this.isRootDirectory ? this.parentDirectory.getFileUp(relativePath) : found;
  }

  /** Finds a file given a relative path. If not found in the current directory, looks in the parent directories. */
  public getDirectoryUp(relativePath: string): NodeDirectory | null {
    const found = this.getDirectory(relativePath);
    return !found && !this.isRootDirectory ? this.parentDirectory.getDirectoryUp(relativePath) : found;
  }

  /** Resolves a NodeJS module. Returns null if not found. */
  public nodeResolve(id: string): string | null {
    try {
      return this.nodeRequire.resolve(id);
    } catch {}
    return null;
  }

  /** Resolves a module package.json from this directory. Returns null if a package is not found. */
  public resolvePackage(id: string): NodePackageJson | null {
    return this.parentDirectory.resolvePackage(id);
  }

  /** Resolves the bin executable of the base package.json for this directory */
  public resolvePackageBin(moduleId: string, executableId?: string | undefined): string | null {
    const packageJson = moduleId ? this.resolvePackage(moduleId) : this.packageJson;
    if (packageJson) {
      const dir = packageJson.file.parentDirectory;
      const content = packageJson.manifest;
      if (content) {
        const { bin } = content;
        const binFile = bin ? (typeof bin === "string" ? bin : bin[executableId || this.basename]) : moduleId;
        return (binFile && dir.nodeResolve(path.resolve(dir.path, binFile))) || null;
      }
    }
    return this.nodeResolve(`${moduleId}/${executableId || moduleId}`);
  }

  public toString() {
    return this.path;
  }
}

export class NodeFile extends NodeFsEntry {
  public readonly parentDirectory: NodeDirectory;

  /** The NodeResolver instance that owns this file. */
  public get resolver(): NodeResolver {
    return this.parentDirectory.resolver;
  }

  /** Always true, this is a file. */
  public get isFile(): true {
    return true;
  }

  /** Always false, this is a file. */
  public get isDirectory(): false {
    return false;
  }

  /** Always false, this is a file. */
  public get isRootDirectory(): false {
    return false;
  }

  /** returns this.parentDirectory.path */
  public get directoryPath(): this["parentDirectory"]["path"] {
    return this.parentDirectory.path;
  }

  /** The node require function for the directory that owns this file. */
  public get nodeRequire(): NodeRequire {
    return this.parentDirectory.nodeRequire;
  }

  /** Gets the package.json for this file, looking in the parent directories. */
  public get packageJson(): NodePackageJson | null {
    return this.parentDirectory.packageJson;
  }

  public constructor(
    parentDirectory: NodeDirectory,
    filePath: string,
    basename: string,
    stats: fs.Stats | null | undefined,
  ) {
    super(filePath, basename, stats);
    this.parentDirectory = parentDirectory;
  }
}

export class NodeDirectory extends NodeFsEntry {
  /** The resolver instance that owns this directory */
  public readonly resolver: NodeResolver;

  /** The parent directory. Is itself for a root. */
  public readonly parentDirectory: NodeDirectory;

  private _require: NodeRequire | null = null;
  private _packageJson: NodePackageJson | null | undefined = undefined;

  /** Always false, this is a directory, not a file. */
  public get isFile(): false {
    return false;
  }

  /** Always true, this is a directory. */
  public get isDirectory(): true {
    return true;
  }

  /** True if this directory is a root directory (parentDirectory === this) */
  public get isRootDirectory(): boolean {
    return this.parentDirectory === this;
  }

  /** returns this.path */
  public get directoryPath(): this["path"] {
    return this.path;
  }

  public constructor(
    resolver: NodeResolver,
    parentDirectory: NodeDirectory | null | undefined,
    directoryPath: string,
    basename: string,
    stats: fs.Stats | null | undefined,
  ) {
    super(directoryPath, basename, stats);
    this.resolver = resolver;
    this.parentDirectory = parentDirectory || this;
  }

  /** Gets the package.json for this or a parent folder of this folder. */
  public get packageJson(): NodePackageJson | null {
    let result = this._packageJson;
    if (result === undefined) {
      const file = this.getFile("package.json");
      result =
        (file && new NodePackageJson(file)) ||
        (this.parentDirectory !== this && this.parentDirectory.packageJson) ||
        null;
      this._packageJson = result;
    }
    return result;
  }

  /** The node require function for this directory. */
  public get nodeRequire(): NodeRequire {
    return this._require || (this._require = Module.createRequire(path.join(this.path, "_")));
  }

  /** Resolves a module package.json from this directory. Returns null if a package is not found. */
  public override resolvePackage(id: string): NodePackageJson | null {
    if (!id || id === "." || id === "./") {
      return this.packageJson;
    }
    if (ABSOLUTE_OR_RELATIVE_PATH_REGEX.test(id)) {
      const dir = this.getDirectory(id);
      return dir && dir.packageJson;
    }
    let current: NodeDirectory = this;
    do {
      const endsWithNodeModules = NODE_MODULES_CASE_INSENSITIVE_REGEX.test(current.basename);
      const dir = endsWithNodeModules
        ? this.getDirectory(path.join(current.path, id))
        : this.getDirectory(path.join(current.path, "node_modules", id));

      if (dir) {
        const pkg = dir.packageJson;
        if (pkg && pkg.packageName === id) {
          return pkg;
        }
      }
      const pkg = current.packageJson;
      if (pkg && pkg.packageName === id) {
        return pkg;
      }
      current = current.parentDirectory;
      if (endsWithNodeModules) {
        current = current.parentDirectory;
      }
    } while (!current.isRootDirectory);
    return null;
  }
}

export class NodePackageJsonWorkspace {
  public readonly root: NodePackageJson;
  public children: NodePackageJson[];

  public constructor(root: NodePackageJson) {
    this.root = root;
  }
}

export class NodePackageJson {
  private _manifest: PackageJson | undefined = undefined;
  private _packageName: string | undefined = undefined;
  private _validationResult: PackageJsonParsed | undefined = undefined;
  private _workspaceChildren: NodePackageJsonWorkspace | undefined = undefined;

  /** The NodeFile instance of this package.json file */
  public readonly file: NodeFile;

  public constructor(file: NodeFile) {
    this.file = file;
  }

  public get workspaceChildren(): NodePackageJsonWorkspace {
    return this._workspaceChildren || (this._workspaceChildren = new NodePackageJsonWorkspace(this));
  }

  /** Gets the name of this package */
  public get packageName(): string {
    let result = this._packageName;
    if (result === undefined) {
      result = this.manifest.name;
      if (typeof result !== "string" || result.length === 0) {
        const p = this.file.parentDirectory;
        const pp = p.parentDirectory;
        result = p !== pp && pp.basename.startsWith("@") ? `${pp.basename}/${p.basename}` : p.basename;
      }
      this._packageName = result;
    }
    return result;
  }

  public set packageName(value: string | undefined) {
    this._packageName = value;
  }

  public get validationResult(): PackageJsonParsed {
    let result = this._validationResult;
    if (!result) {
      result = PackageJsonParsed.fromContent(this.manifest, {
        filePath: this.file.path,
        parseFromJSON: false,
        strict: true,
        loadWorkspaces: false,
        onLoadWorkspaceChildProjectSync: (filePath: string) => {
          const file = filePath.endsWith("package.json") && this.file.resolver.getFile(filePath);
          const childPkg = file && file.packageJson;
          if (childPkg && childPkg !== this) {
            const v = childPkg.validationResult;
            if (v.workspaces.length === 0) {
              return v;
            }
            return PackageJsonParsed.fromContent(childPkg.manifest, { filePath, strict: true, loadWorkspaces: false });
          }
          return PackageJsonParsed.readSync(filePath, { strict: true, loadWorkspaces: false });
        },
      });
      this._validationResult = result;
    }
    return result;
  }

  public get sanitized(): PackageJson.Sanitized {
    return this.validationResult.content;
  }

  /** Gets the content of the deserialized JSON file */
  public get manifest(): PackageJson {
    let manifest = this._manifest as UnsafeAny;
    if (manifest === undefined) {
      manifest = this.loadManifest() as UnsafeAny;
      this._manifest = manifest;
    }
    return manifest === this ? undefined : manifest;
  }

  public set manifest(value: PackageJson) {
    this._manifest = value;
  }

  protected loadManifest(): PackageJson {
    const filePath = this.file.path;
    const cache = this.file.resolver.requireCache;
    const cached = cache && cache[filePath];
    let manifest: PackageJson | null = null;
    if (cached) {
      manifest = cached.exports;
    } else {
      try {
        manifest = JSON.parse(toUTF8(fs.readFileSync(filePath, "utf8")));
        if (cache) {
          const mod = new Module(filePath);
          mod.filename = filePath;
          mod.loaded = true;
          mod.paths = [path.dirname(filePath)];
          cache[filePath] = mod;
        }
      } catch {}
    }
    return typeof manifest === "object" && manifest !== null && !Array.isArray(manifest) ? manifest : {};
  }
}

export class NodeResolver {
  public static default: NodeResolver = new NodeResolver();

  private _entries = new Map<string, NodeDirectory | NodeFile | null>();
  private _projectPath: string;
  private _requireCache: Record<string, NodeModule> | null = (Module as UnsafeAny)._cache || null;
  private _projectDirectory: NodeDirectory | null | undefined = undefined;

  public constructor(cwd: string = process.cwd()) {
    this._projectPath = path.resolve(cwd);
  }

  public get requireCache(): Record<string, NodeModule> | null {
    const result = this._requireCache;
    return result !== undefined ? result : (this._requireCache = (module as UnsafeAny)._cache || null);
  }

  public set requireCache(value: Record<string, NodeModule> | null) {
    this._requireCache = value;
  }

  public get projectPath(): string {
    return this._projectPath;
  }

  public set projectPath(value: string) {
    value = path.resolve(value);
    const directory = this.getDirectory(value);
    this._projectDirectory = directory;
    this._projectPath = directory ? directory.path : value;
  }

  public get projectPackageJson(): NodePackageJson | null {
    const dir = this.projectDirectory;
    return dir ? dir.packageJson : null;
  }

  public get projectDirectory(): NodeDirectory | null {
    return this._projectDirectory || (this._projectDirectory = this.getDirectory(this.projectPath));
  }

  public clear() {
    this._projectDirectory = undefined;
    this._entries.clear();
  }

  public resolvePath(p: string | URL): string {
    return path.resolve(this.projectPath, typeof p !== "string" || /^file:\/\//i.test(p) ? fileURLToPath(p) : p);
  }

  public getFileOrDirectory(fileOrDirectoryPath: string | URL): NodeDirectory | NodeFile | null {
    const resolvedPath = this.resolvePath(fileOrDirectoryPath);
    const result = this._entries.get(resolvedPath);
    return result !== undefined ? result : this._loadFileOrDirectory(resolvedPath);
  }

  public getPackageJson(fileOrDirectoryPath: string | URL): NodePackageJson | null {
    const directory = this.getDirectoryOrFileDirectory(fileOrDirectoryPath);
    return directory ? directory.packageJson : null;
  }

  public getDirectoryOrFileDirectory(fileOrDirectoryPath: string | URL): NodeDirectory | null {
    const result = this.getFileOrDirectory(fileOrDirectoryPath);
    return result ? (result.isDirectory ? result : result.parentDirectory) : null;
  }

  public getDirectory(directoryPath: string | URL): NodeDirectory | null {
    const result = this.getFileOrDirectory(directoryPath);
    return result && result.isDirectory ? result : null;
  }

  public getFile(filePath: string | URL): NodeFile | null {
    const result = this.getFileOrDirectory(filePath);
    return result && result.isFile ? result : null;
  }

  public getRealPath(filePath: string | URL): string | null {
    const fileOrDirectory = this.getFileOrDirectory(filePath);
    return fileOrDirectory ? fileOrDirectory.path : null;
  }

  /** Resolve the path of commonJS module from the given directory */
  public resolveCommonJS(id: string, cwd?: string | URL | null | undefined): string | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory;
    return directory && directory.nodeResolve(id);
  }

  /** Resolve the package.json of the given package from the given directory */
  public resolvePackage(id: string, cwd?: string | URL | null | undefined): NodePackageJson | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory;
    return directory && directory.resolvePackage(id);
  }

  /** Resolves the bin executable of a package */
  public resolvePackageBin(
    moduleId: string,
    executableId?: string | undefined,
    cwd?: string | URL | null | undefined,
  ): string | null {
    const directory = cwd ? this.getDirectory(cwd) : this.projectDirectory;
    return directory ? directory.resolvePackageBin(moduleId, executableId) : null;
  }

  private _loadFileOrDirectory(input: string): NodeDirectory | NodeFile | null {
    const parentPath = path.dirname(input);

    let parent: NodeDirectory | null = null;
    if (parentPath !== input) {
      parent = this.getDirectory(parentPath);
      if (!parent) {
        this._entries.set(input, null);
        return null;
      }
    }

    const basename = path.basename(input);
    const inputPath = parent ? (basename ? path.join(parent.path, basename) : parent.path) : input;

    const stats = fs_tryStatSync(inputPath);
    if (!stats) {
      this._entries.set(inputPath, null);
      return null;
    }

    const realPath = fs_tryRealpathSync(inputPath) || inputPath;
    if (!realPath) {
      this._entries.set(inputPath, null);
      return null;
    }

    let result: NodeDirectory | NodeFile | null = null;
    if (stats) {
      if (stats.isDirectory()) {
        result = new NodeDirectory(this, parent, realPath, basename, stats);
      } else if (parent) {
        result = new NodeFile(parent, realPath, basename, stats);
      }
    }
    this._entries.set(realPath, result);
    this._entries.set(inputPath, result);
    return result;
  }
}

function fs_tryRealpathSync(unrealpath: string): string | null {
  try {
    return fs.realpathSync.native(unrealpath);
  } catch (_) {
    return null;
  }
}

function fs_tryStatSync(realpath: string): fs.Stats | null {
  try {
    return fs.statSync(realpath, { bigint: false, throwIfNoEntry: false }) || null;
  } catch {}
  return null;
}
