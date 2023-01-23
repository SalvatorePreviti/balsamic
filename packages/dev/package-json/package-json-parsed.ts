/// <reference path="./normalize-package-data.d.ts" />

import path from "node:path";
import fs from "node:fs";
import glob from "fast-glob";
import type { ValidateFunction, ErrorObject } from "ajv";
import Ajv from "ajv";
import normalizePackageData from "normalize-package-data";
import { toUTF8 } from "../utils/utils";
import { devError } from "../dev-error";
import { PackageJson } from "./package-json-type";
import { makePathRelative } from "../path";
import type { PackageJsonParseMessageSeverity } from "./package-json-parsed-msgs";
import { PackageJsonParseMessage, PackageJsonParseMessages } from "./package-json-parsed-msgs";
import { getColor } from "../colors";
import { try_readFileSync as try_readYamlFileSync, try_readFile as try_readYamlFile } from "../_yaml";
import { deepClone } from "../plain-objects";

const { isArray } = Array;
const { keys: objectKeys, entries: objectEntries } = Object;

const INSIDE_NODE_MODULES_REGEX = /[\\/]node_modules([\\/]|$)/i;

const private_WorkspacesSymbol = Symbol.for("workspaces");

export class PackageJsonParsed {
  public filePath: string | undefined = undefined;
  public packageDirectoryPath: string | undefined = undefined;
  public packageNameAndVersion: string = "";
  public validation = new PackageJsonParseMessages();

  /** True if parsed with strict rules */
  public strict: boolean = true;

  private [private_WorkspacesSymbol]?: PackageJsonParsed[] | undefined = undefined;

  public content: PackageJson.Sanitized = PackageJson.Sanitized.empty();

  protected constructor(filePath: string | undefined | null) {
    if (filePath !== undefined && filePath !== null) {
      try {
        this.filePath = path.resolve(filePath);
        this.packageDirectoryPath = path.dirname(this.filePath);
      } catch {}
    }
  }

  public get hasErrors(): boolean {
    return this.validation.hasErrors || this.workspaces.some((workspace) => workspace.hasErrors);
  }

  public get hasWarningsOrErrors(): boolean {
    return this.validation.hasWarningsOrErrors || this.workspaces.some((workspace) => workspace.hasWarningsOrErrors);
  }

  public get workspaces(): PackageJsonParsed[] {
    let result = this[private_WorkspacesSymbol];
    if (result === undefined) {
      result = this.filePath ? _loadWorskpcesSync(this.filePath, this.content as unknown as PackageJson) : [];
      this[private_WorkspacesSymbol] = result;
    }
    return result;
  }

  public set workspaces(value: PackageJsonParsed[] | undefined) {
    this[private_WorkspacesSymbol] = value;
  }

  public get name(): string {
    return this.content.name;
  }

  public getWorkspace(packageName: string, throwIfNotFound: true): PackageJsonParsed;
  public getWorkspace(packageName: string, throwIfNotFound?: false | undefined): PackageJsonParsed | undefined;
  public getWorkspace(packageName: string, throwIfNotFound?: boolean): PackageJsonParsed | undefined {
    const workspaces = this.workspaces;
    for (let i = 0, len = workspaces.length; i < len; ++i) {
      const workspace = workspaces[i];
      if (workspace!.content.name === packageName) {
        return workspace;
      }
    }
    if (throwIfNotFound) {
      throw devError(`Workspace ${packageName} not found.`, { showStack: false });
    }
    return undefined;
  }

  public validationMessagesToString(
    options: {
      colors?: boolean | undefined;
      workspaces?: boolean | undefined;
      severity?: PackageJsonParseMessageSeverity;
    } = {},
  ): string {
    const { colors = false, workspaces = true } = options;
    let result = "";
    const append = (self: PackageJsonParsed) => {
      let msgs = self.validation.toFormattedString({ ...options, workspaces: false, indent: "  " });
      if (msgs.length > 0) {
        const name = (self.filePath && makePathRelative(self.filePath)) || this.content.name;
        if (name) {
          if (colors) {
            msgs = `${getColor(self.validation.maxSeverity)(name)}:\n${msgs}`;
          } else {
            msgs = `${name}:\n${msgs}`;
          }
        }
        if (result.length > 0) {
          result += "\n";
        }
        result += msgs;
      }
    };
    append(this);
    if (workspaces) {
      this.workspaces.forEach(append);
    }
    return result;
  }

  public validateWorkspaceDependenciesVersions(): void {
    const deps = new Map<string, { pkg: PackageJsonParsed; version: string }>();
    const workspaces = this.workspaces;
    if (workspaces.length === 0) {
      return;
    }

    const workspaceNames = new Set<string>();
    for (const workspace of workspaces) {
      workspaceNames.add(workspace.content.name);
    }
    const addDependency = (pkg: PackageJsonParsed, field: string, name: string, version: string) => {
      const found = deps.get(name);
      if (found === undefined) {
        deps.set(name, { pkg, version });
        return;
      }

      if (pkg !== this && found.pkg !== pkg && found.version !== version && !workspaceNames.has(name)) {
        pkg.validation.add(
          "warning",
          `Version mismatch. "${name}": "${version}" in ${makePathRelative(found.pkg.filePath, {
            startDot: true,
          })} with version "${found.version}".`,
          field,
        );
      }
    };

    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      for (const [name, version] of objectEntries(this.content[field])) {
        if (name && typeof name === "string" && version && typeof version === "string") {
          addDependency(this, field, name, version);
        }
      }
    }

    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      for (const workspace of workspaces) {
        for (const [name, version] of objectEntries(workspace.content[field])) {
          if (name && typeof name === "string" && version && typeof version === "string") {
            addDependency(workspace, field, name, version);
          }
        }
      }
    }

    deps.clear();

    for (const workspace of workspaces) {
      for (const [name, version] of objectEntries(workspace.content.peerDependencies)) {
        if (name && typeof name === "string" && version && typeof version === "string") {
          addDependency(workspace, "peerDependencies", name, version);
        }
      }
    }
  }

  public static error(
    error: Error | string | PackageJsonParseMessage,
    filePath?: string | undefined | null,
  ): PackageJsonParsed {
    const result = new PackageJsonParsed(filePath);
    result.validation.add(error);
    return result;
  }

  public static readSync(packageJsonFilePath: string, options?: PackageJsonParsed.ReadOptions): PackageJsonParsed {
    try {
      packageJsonFilePath = path.resolve(packageJsonFilePath);
      return PackageJsonParsed.fromContent(fs.readFileSync(packageJsonFilePath, "utf8"), {
        ...options,
        filePath: packageJsonFilePath,
        parseFromJSON: "parse",
      });
    } catch (readError) {
      const pkg = PackageJsonParsed.error(devError(readError), packageJsonFilePath);
      pkg.strict = options?.strict ?? true;
      return pkg;
    }
  }

  public static async readAsync(
    packageJsonFilePath: string,
    options?: PackageJsonParsed.ReadOptions,
  ): Promise<PackageJsonParsed> {
    try {
      packageJsonFilePath = path.resolve(packageJsonFilePath);
      const loaded = PackageJsonParsed.fromContent(await fs.promises.readFile(packageJsonFilePath, "utf8"), {
        ...options,
        filePath: packageJsonFilePath,
        parseFromJSON: "parse",
        loadWorkspaces: false,
      });
      loaded.workspaces = await _loadWorskpcesAsync(packageJsonFilePath, loaded.content);
      if (!loaded.hasErrors && (options?.validateWorkspaceDependenciesVersions ?? true)) {
        loaded.validateWorkspaceDependenciesVersions();
      }
      return loaded;
    } catch (readError) {
      const pkg = PackageJsonParsed.error(devError(readError), packageJsonFilePath);
      pkg.strict = options?.strict ?? true;
      return pkg;
    }
  }

  public static fromContent(
    packageJson: PackageJson.Sanitized | string | Buffer | unknown,
    options?: PackageJsonParsed.LoadOptions | string | undefined,
  ): PackageJsonParsed {
    if (typeof options === "string") {
      options = { filePath: options };
    }

    let isReadable = true;
    const result = new PackageJsonParsed(options?.filePath);
    result.strict =
      !options || options.strict || !options?.filePath || !INSIDE_NODE_MODULES_REGEX.test(options?.filePath);

    const addError = result.validation.add.bind(result.validation);

    if (options?.parseFromJSON) {
      if (options.parseFromJSON === "readFile") {
        const filePath =
          typeof packageJson === "string" ? packageJson : typeof options.filePath === "string" ? options.filePath : "";
        if (!filePath) {
          addError("error", "Invalid package.json file path");
          packageJson = undefined;
        } else {
          packageJson = _readPackageJsonFromFile(filePath, addError, packageJson, result);
        }
      } else {
        packageJson = _parsePackageJson(packageJson, addError);
      }
    }

    let content = packageJson as PackageJson.Sanitized;
    let packageNameAndVersion: string | undefined;

    if (
      typeof packageJson !== "object" ||
      packageJson === null ||
      isArray(packageJson) ||
      Buffer.isBuffer(packageJson)
    ) {
      isReadable = false;
      addError(
        new PackageJsonParseMessage(
          "error",
          `package.json must be an object but is ${
            packageJson === null ? "null" : isArray(packageJson) ? "an Array" : `a ${typeof packageJson}`
          }`,
        ),
      );
    }

    if (!isReadable) {
      content = PackageJson.Sanitized.empty();
    } else {
      _packageJsonValidateSchema(packageJson, addError);

      content = deepClone(packageJson) as PackageJson.Sanitized;

      if (content.version === undefined) {
        addError(new PackageJsonParseMessage("error", "No version", "version"));
      }

      if (!content.private && content.workspaces) {
        addError(
          new PackageJsonParseMessage("error", "private must be true if workspaces field is present", "private"),
        );
      } else if (content.private === undefined) {
        addError(new PackageJsonParseMessage("warning", "field private should be a boolean", "private"));
      }

      const nameValidationResult = PackageJson.validatePackageName(content.name);
      if (nameValidationResult.status !== "valid") {
        addError(new PackageJsonParseMessage("error", nameValidationResult.message, "name"));
      }
    }

    ({ content, packageNameAndVersion } = _npmNormalizePackageJson(
      PackageJson.sanitize(content),
      isReadable && result.strict,
      addError,
    ));

    if (!content.name && result.filePath) {
      const parent = path.basename(path.dirname(result.filePath));
      if (parent && path.dirname(parent) !== parent) {
        const base = path.basename(result.filePath);
        content.name = parent.startsWith("@") ? `${parent}/${base}` : base;
      }
    }

    result.packageNameAndVersion =
      packageNameAndVersion || content.version ? `${content.name || ""}@${content.version || ""}` : content.name;

    if (isReadable) {
      _validateDependenciesDefinitions(content, addError);
    }

    result.content = content;
    if (isReadable && (options?.loadWorkspaces ?? true) && result.filePath) {
      result.workspaces = _loadWorskpcesSync(result.filePath, content, options);
      if (!result.hasErrors && (options?.validateWorkspaceDependenciesVersions ?? true)) {
        result.validateWorkspaceDependenciesVersions();
      }
    }
    return result;
  }

  /** Returns a normalized, formatted, sorted, cleaned up package.json content, good to be written on disk. */
  public toJSON(): PackageJson {
    const result = PackageJson.sortPackageJsonFields(PackageJson.sanitize(this.content) as PackageJson);
    for (const dep of PackageJson.dependencyFields) {
      const item = result[dep];
      if (item !== undefined && objectKeys(item).length === 0) {
        delete result[dep];
      }
    }
    if (isArray(result.optionalDependencies) && result.optionalDependencies.length === 0) {
      delete result.optionalDependencies;
    }
    return result;
  }
}

export namespace PackageJsonParsed {
  export interface ReadOptions {
    strict?: boolean | undefined;

    loadWorkspaces?: boolean;

    validateWorkspaceDependenciesVersions?: boolean;

    onLoadWorkspaceChildProjectSync?:
      | ((packageJsonFilePath: string, options: LoadOptions) => PackageJsonParsed | undefined)
      | undefined;

    onLoadWorkspaceChildProjectAsync?:
      | ((packageJsonFilePath: string, options: LoadOptions) => PackageJsonParsed)
      | undefined;
  }

  export interface LoadOptions {
    filePath?: string | undefined;

    /**
     * If true or "parse", the input is considered as a JSON string (or Buffer).
     * If "readFile", the file will be loaded synchronously with fs.readFile. And if is a directory, package.json will be read from the directory.
     * Else, we assume the input is the parsed package.json content.
     */
    parseFromJSON?: boolean | "readFile" | "parse" | undefined;

    strict?: boolean | undefined;

    loadWorkspaces?: boolean;

    validateWorkspaceDependenciesVersions?: boolean;

    onLoadWorkspaceChildProjectSync?:
      | ((packageJsonFilePath: string, options: LoadOptions) => PackageJsonParsed | undefined)
      | undefined;
  }
}

let _packageJsonAjvValidator: ValidateFunction<PackageJson.Sanitized> | null = null;

function _readPackageJsonFromFile(
  filePath: string,
  addError: {
    (err: Error | PackageJsonParseMessage): void;
    (severity: PackageJsonParseMessageSeverity, message: string, field?: string | undefined): void;
  },
  packageJson: unknown,
  result: PackageJsonParsed,
) {
  let fileContent: string | undefined;
  try {
    filePath = path.resolve(filePath);
    fileContent = fs.readFileSync(filePath, "utf8");
  } catch (e: unknown) {
    const error = devError(e);
    if (error?.code !== "EISDIR") {
      addError(devError(error));
    } else {
      try {
        filePath = path.resolve(filePath, "package.json");
        fileContent = fs.readFileSync(filePath, "utf8");
      } catch (e1) {
        addError(error);
      }
    }
  }
  if (fileContent !== undefined) {
    packageJson = _parsePackageJson(fileContent, addError);
  } else if (!result.hasErrors) {
    addError("error", "Could not read package.json");
  }
  try {
    result.filePath = filePath;
    result.packageDirectoryPath = path.dirname(result.filePath);
  } catch {}

  return packageJson;
}

function _parsePackageJson(packageJson: unknown, addError: (err: PackageJsonParseMessage) => void): unknown {
  if (packageJson !== undefined && packageJson !== null) {
    if (Buffer.isBuffer(packageJson)) {
      packageJson = packageJson.toString();
    }
    if (typeof packageJson !== "string") {
      addError(new PackageJsonParseMessage("error", `Cannot JSON parse a ${typeof packageJson}`));
    } else {
      try {
        packageJson = JSON.parse(toUTF8(packageJson));
      } catch (error: unknown) {
        addError(new PackageJsonParseMessage("error", `JSON.parse error: ${devError.getMessage(error)}`));
      }
    }
  }
  return packageJson;
}

function _packageJsonValidateSchema(
  packageJson: unknown,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): void {
  const ajvValidator = _packageJsonAjvValidator || (_packageJsonAjvValidator = _createAjvValidator());
  const isValid = ajvValidator(packageJson);
  const validationErrors = ajvValidator.errors;
  if (validationErrors && validationErrors.length > 0) {
    ajvValidator.errors = null;
    for (let i = 0, len = validationErrors.length; i < len; ++i) {
      addError(_packageJsonValidationErrorFromAjvError(validationErrors[i]!, packageJson));
    }
  } else if (!isValid) {
    addError(new PackageJsonParseMessage("error", "Invalid package.json"));
  }
}

function _validateDependenciesDefinitions(
  content: PackageJson.Sanitized,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): void {
  const erroredDependencies = new Set<string>();
  const dfields = PackageJson.dependencyFields;
  for (let i = 0; i < dfields.length; ++i) {
    const ka = dfields[i]!;
    const da = content[ka] || {};

    // Validate dependency name
    for (const name of objectKeys(da)) {
      if (!erroredDependencies.has(name)) {
        const depNameValidationResult = PackageJson.validatePackageName(name);
        if (depNameValidationResult.status === "invalid") {
          erroredDependencies.add(name);
          const stringName = JSON.stringify(name);
          addError(new PackageJsonParseMessage("error", depNameValidationResult.message, `${ka}[${stringName}]`));
        }
      }
    }

    // Validates that the same dependency is not repeated in more than one group of dependencies
    for (let j = i + 1; j < dfields.length; ++j) {
      const kb = dfields[j]!;
      if (ka === "devDependencies" || kb === "devDependencies") {
        const other = ka === "devDependencies" ? kb : ka;
        if (other === "peerDependencies" || other === "optionalDependencies") {
          continue;
        }
      }
      const db = content[kb] || {};
      for (const name of objectKeys(da)) {
        if (!erroredDependencies.has(name) && name in db) {
          erroredDependencies.add(name);
          const stringName = JSON.stringify(name);
          addError(
            new PackageJsonParseMessage(
              "error",
              `Dependency "${name}" is both in ${ka} and ${kb}`,
              `${kb}[${stringName}]`,
            ),
          );
        }
      }
    }
  }
}

function _npmNormalizePackageJson(
  content: PackageJson,
  strict: boolean,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): { content: PackageJson.Sanitized; packageNameAndVersion: string | undefined; readme: string } {
  let packageNameAndVersion: string | undefined;
  const readme = "";
  try {
    const isPrivate = !!content.private;
    const normalizedContent = JSON.parse(JSON.stringify(content)) as PackageJson.Sanitized;
    normalizedContent.private = false;
    const oldReadme = normalizedContent.readme;
    normalizePackageData(normalizedContent, (m) => addError(_packageJsonValidatorErrorFromNormalizer(m)), strict);
    if (oldReadme !== undefined) {
      normalizedContent.readme = oldReadme;
    } else {
      delete normalizedContent.readme;
    }

    for (const k of PackageJson.dependencyFields) {
      normalizedContent[k] = normalizedContent[k] ?? {};
    }

    normalizedContent.private = isPrivate;

    if (typeof normalizedContent._id === "string") {
      packageNameAndVersion = normalizedContent._id;
      delete normalizedContent._id;
    }

    const dependencies: Record<string, string> = {};
    if (content.dependencies && normalizedContent.dependencies) {
      for (const [name, version] of objectEntries(normalizedContent.dependencies)) {
        if (name in content.dependencies) {
          dependencies[name] = version;
        }
      }
    }
    normalizedContent.dependencies = dependencies;
    content = normalizedContent;
  } catch (e: unknown) {
    const errorMessage = devError.getMessage(e) || "Invalid package.json";
    let field: string | undefined;
    if (errorMessage.startsWith("name field must be a string")) {
      field = "name";
    } else if (errorMessage.startsWith("Invalid version:")) {
      field = "version";
    }
    addError(new PackageJsonParseMessage("error", errorMessage, field));
  }
  return { content: content as PackageJson.Sanitized, packageNameAndVersion, readme };
}

function _packageJsonValidatorErrorFromNormalizer(msg: string | undefined) {
  if (typeof msg !== "string" || !msg) {
    return undefined;
  }
  if (msg.endsWith(".")) {
    msg = msg.slice(0, -1);
  }
  let severity: PackageJsonParseMessageSeverity = "warning";
  let field: string | undefined;
  switch (msg) {
    case "No repository field":
      severity = "info";
      break;
    case "No README data":
      return undefined;
  }

  if (!field) {
    const splitted = msg.split(" ");
    if (splitted.length === 2 && splitted[0] === "No") {
      field = splitted[1];
    } else if (splitted.length === 3 && splitted[0] === "No" && splitted[2] === "field") {
      msg = `${splitted[0]} ${splitted[1]}`;
      field = splitted[1];
    } else if (splitted.length > 3 && splitted[0] === "field") {
      field = splitted[1];
    } else if (splitted.length > 3 && splitted[1] === "field") {
      field = splitted[0];
    }
  }

  return new PackageJsonParseMessage(severity, msg, field || undefined);
}

function _packageJsonValidationErrorFromAjvError(
  error: ErrorObject,
  content: unknown,
): PackageJsonParseMessage | undefined {
  let message = error.message || "Invalid package.json";
  let prop: string | undefined = error.propertyName || error.instancePath || "";
  if (prop.startsWith("/")) {
    prop = prop.slice(1);
  }
  prop = prop.replaceAll("/", ".");
  if (!prop) {
    prop = undefined;
  }
  if (message === "must NOT be valid" || message === "must match a schema in anyOf") {
    message = prop ? "Invalid" : "Invalid package.json";
  }
  if (!prop && message === "must be object") {
    message = `package.json must be an object but is ${
      content === null ? "null" : isArray(content) ? "an Array" : `a ${typeof content}`
    }`;
  }
  return new PackageJsonParseMessage("error", message, prop);
}

function _createAjvValidator(): ValidateFunction<PackageJson.Sanitized> {
  const packageJsonSchema = require("./package-json.schema.json");
  return new Ajv({
    validateSchema: false,
    allowUnionTypes: true,
    strictSchema: false,
    strictNumbers: true,
    strictTypes: true,
    strictTuples: true,
    allErrors: true,
    verbose: false,
    logger: false,
    useDefaults: true,
    coerceTypes: false,
  }).compile(packageJsonSchema) as ValidateFunction<PackageJson.Sanitized>;
}

async function _loadWorskpcesAsync(
  packageJsonPath: string,
  packageJson: PackageJson,
  options?: PackageJsonParsed.ReadOptions,
): Promise<PackageJsonParsed[]> {
  // Implementation based on https://github.com/npm/map-workspaces

  packageJsonPath = path.resolve(packageJsonPath);
  const directory = path.dirname(packageJsonPath);
  if (INSIDE_NODE_MODULES_REGEX.test(directory)) {
    return [];
  }

  if (Buffer.isBuffer(packageJson) || typeof packageJson === "string") {
    packageJson = JSON.parse(toUTF8(packageJson));
  }

  const seen = new Map<string, Set<string>>();

  const globOptions: glob.Options = { cwd: directory, absolute: true, ignore: ["**/node_modules/**", "**/.git/**"] };
  const globsResult = (
    await Promise.all(
      _workspaceGetPatterns(
        packageJson.workspaces,
        await try_readYamlFile(path.resolve(directory, "pnpm-workspace.yaml")),
      ).map(async (pattern) => ({
        pattern,
        matches: await glob(pattern.pattern, globOptions),
      })),
    )
  ).sort((a, b) => a.pattern.index - b.pattern.index);

  const loading = new Map<string, Promise<PackageJsonParsed>>();
  const loaded = new Map<string, PackageJsonParsed>();

  const loadChildOptions = { ...options, loadWorkspaces: false };

  const promises: Promise<{
    pkg: PackageJsonParsed;
    pattern: { pattern: string; negate: boolean };
    index: number;
  }>[] = [];
  for (const { matches, pattern } of globsResult) {
    for (const match of matches) {
      if (packageJsonPath === match) {
        continue;
      }
      const index = promises.length;
      let p = loading.get(match);
      if (p === undefined) {
        if (options?.onLoadWorkspaceChildProjectAsync) {
          p = Promise.resolve(options.onLoadWorkspaceChildProjectAsync(match, loadChildOptions));
        } else if (options?.onLoadWorkspaceChildProjectSync) {
          p = Promise.resolve(
            options.onLoadWorkspaceChildProjectSync(match, loadChildOptions) ??
              PackageJsonParsed.readAsync(match, loadChildOptions),
          );
        } else {
          p = PackageJsonParsed.readAsync(match, loadChildOptions);
        }
        loading.set(match, p);
      }
      promises.push(
        p.then((pkg) => {
          loaded.set(match, pkg);
          return { pkg, pattern, index };
        }),
      );
    }
  }

  for (const { pkg, pattern } of (await Promise.all(promises)).sort((a, b) => a.index - b.index)) {
    _workspaceProcessMatch(seen, pkg, pattern);
  }

  return _workspaceFinalize(seen, loaded);
}

function _loadWorskpcesSync(
  packageJsonPath: string,
  packageJson: PackageJson,
  options?: PackageJsonParsed.ReadOptions,
): PackageJsonParsed[] {
  // Implementation based on https://github.com/npm/map-workspaces

  packageJsonPath = path.resolve(packageJsonPath);
  const directory = path.dirname(packageJsonPath);
  if (directory.includes(`${path.sep}node_modules${path.sep}`)) {
    return [];
  }

  if (Buffer.isBuffer(packageJson) || typeof packageJson === "string") {
    packageJson = JSON.parse(toUTF8(packageJson));
  }

  const seen = new Map<string, Set<string>>();
  const globOptions: glob.Options = {
    cwd: directory,
    absolute: true,
    onlyFiles: false,
    ignore: ["**/node_modules/**", "**/bower_components/**", "**/.git/**", "**/__test__/**", "**/__tests__/**"],
  };

  const loaded = new Map<string, PackageJsonParsed>();
  const pkgsByName = new Map<string, PackageJsonParsed>();
  const loadChildOptions = { ...options, loadWorkspaces: false };

  for (const pattern of _workspaceGetPatterns(
    packageJson.workspaces,
    try_readYamlFileSync(path.resolve(directory, "pnpm-workspace.yaml")),
  )) {
    const matches = glob.sync(pattern.pattern, globOptions);
    for (const match of matches) {
      if (packageJsonPath === match) {
        continue;
      }
      let pkg = loaded.get(match);
      if (pkg === undefined) {
        if (options?.onLoadWorkspaceChildProjectSync) {
          pkg =
            options.onLoadWorkspaceChildProjectSync(match, loadChildOptions) ??
            PackageJsonParsed.readSync(match, loadChildOptions);
        } else {
          pkg = PackageJsonParsed.readSync(match, loadChildOptions);
        }
        pkgsByName.set(pkg.content.name || pkg.filePath || match, pkg);
        loaded.set(match, pkg);
      }
      _workspaceProcessMatch(seen, pkg, pattern);
    }
  }
  return _workspaceFinalize(seen, loaded);
}

function _workspaceFinalize(
  seen: Map<string, Set<string>>,
  loaded: Map<string, PackageJsonParsed>,
): PackageJsonParsed[] {
  // Implementation based on https://github.com/npm/map-workspaces

  const loadedByName = new Map<string, PackageJsonParsed>();
  for (const v of loaded.values()) {
    const name = (v.content as PackageJson).name || v.filePath;
    if (name) {
      loadedByName.set(name, v);
    }
  }

  const packages = new Set<string>();
  // const errors = new Set<string>();
  for (const [packageName, seenPackagePathnames] of Array.from(seen).sort(([a], [b]) => a.localeCompare(b))) {
    if (seenPackagePathnames.size > 0) {
      packages.add(packageName);
      if (seenPackagePathnames.size > 1) {
        const found = loadedByName.get(packageName);
        if (found) {
          found.validation.add(
            "error",
            `wokspace conflicts in ${Array.from(seenPackagePathnames).sort().join(", ")}`,
            "workspaces",
          );
        }
      }
    }
  }

  return Array.from(loaded.values())
    .filter((pkg) => {
      const name = (pkg.content as PackageJson).name || pkg.filePath;
      return !name || packages.has(name);
    })
    .sort((a, b) => a.filePath!.localeCompare(b.filePath!));
}

function _workspaceProcessMatch(
  seen: Map<string, Set<string>>,
  pkg: PackageJsonParsed,
  pattern: { pattern: string; negate: boolean },
) {
  // Implementation based on https://github.com/npm/map-workspaces
  const name = (pkg.content as PackageJson).name || pkg.filePath;
  if (name) {
    let seenPackagePathnames = seen.get(name);
    if (!seenPackagePathnames) {
      seenPackagePathnames = new Set();
      seen.set(name, seenPackagePathnames);
    }
    if (pattern.negate) {
      seenPackagePathnames.delete(pkg.packageDirectoryPath || name);
    } else {
      seenPackagePathnames.add(pkg.packageDirectoryPath || name);
    }
  }
}

function _workspaceGetPatterns(
  workspaces: string[] | PackageJson.WorkspaceConfig | undefined,
  pnpmWorkspaces: unknown,
) {
  // Implementation based on https://github.com/npm/map-workspaces

  const results = [];
  const patterns = workspaces
    ? isArray(workspaces)
      ? workspaces
      : isArray(workspaces.packages)
      ? workspaces.packages
      : []
    : [];

  if (typeof pnpmWorkspaces === "object" && pnpmWorkspaces !== null && !Array.isArray(pnpmWorkspaces)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pnpmWorkspacePackages = (pnpmWorkspaces as any).packages;
    if (typeof pnpmWorkspacePackages === "string") {
      pnpmWorkspacePackages = [pnpmWorkspacePackages];
    }
    if (Array.isArray(pnpmWorkspacePackages) && pnpmWorkspacePackages.length > 0) {
      const existing = new Set(patterns);
      for (const pattern of pnpmWorkspacePackages) {
        if (typeof pattern === "string" && pattern.length > 0 && !existing.has(pattern)) {
          patterns.push(pattern);
        }
      }
    }
  }

  let index = 0;
  for (let pattern of patterns) {
    if (typeof pattern === "string") {
      const excl = /^!+/.exec(pattern);
      if (excl) {
        pattern = pattern.slice(excl[0]?.length ?? 0);
      }

      // an odd number of ! means a negated pattern.  !!foo ==> foo
      const negate = !!(excl && excl[0]!.length % 2 === 1);

      // strip off any / from the start of the pattern.  /foo => foo
      pattern = pattern.replace(/^\/+/, "").replace(/\\/g, "/");
      pattern = `${pattern.endsWith("/") ? pattern : `${pattern}/`}package.json`;

      results.push({ pattern, negate, index: index++ });
    }
  }

  return results;
}
