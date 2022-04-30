import path from "node:path";
import fs from "node:fs";
import { builtinModules } from "node:module";
import glob from "fast-glob";
import Ajv, { ValidateFunction, ErrorObject } from "ajv";
import normalizePackageData from "normalize-package-data";
import { toUTF8 } from "../utils";
import { devError } from "../dev-error";
import type { PackageJson } from "./package-json-type";
import { makePathRelative } from "../path";

export namespace PackageJsonParseMessage {
  export type Severity = "warning" | "error" | "info";
}

export class PackageJsonParseMessage {
  public constructor(
    public severity: PackageJsonParseMessage.Severity,
    public message: string,
    public field?: string | undefined,
  ) {}

  public toString(): string {
    const { severity, message, field } = this;
    let result = severity || "error";
    result += ": ";
    if (field && !message.startsWith(field)) {
      result += field;
      result += ": ";
    }
    return result + message;
  }
}

export namespace PackageJsonParsed {
  export type Status = "invalid" | "readable" | "valid";

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

  export interface ParsedPackageName {
    scope: string;
    name: string;
    subPath: string;
  }

  export interface PackageNameValidation {
    status: "valid" | "valid-only-as-dependency" | "invalid";
    message: string;
    scope: string;
    name: string;
  }
}

export class PackageJsonParsed {
  public filePath: string | undefined = undefined;
  public packageDirectoryPath: string | undefined = undefined;
  public validation: PackageJsonParsed.Status = "valid";
  public errors: PackageJsonParseMessage[] = [];
  public warnings: PackageJsonParseMessage[] = [];
  public informations: PackageJsonParseMessage[] = [];
  public fieldsWithErrors = new Set<string>();
  public packageNameAndVersion: string = "";
  public strict: boolean = true;

  public content: PackageJson.Sanitized = {
    name: "",
    version: "",
    private: true,
    dependencies: {},
    devDependencies: {},
    optionalDependencies: {},
    peerDependencies: {},
  };

  #workspaces?: PackageJsonParsed[] | undefined;

  public get workspaces(): PackageJsonParsed[] {
    let result = this.#workspaces;
    if (result === undefined) {
      result =
        this.validation === "readable" && this.filePath
          ? _loadWorskpcesSync(this.filePath, this.content as unknown as PackageJson)
          : [];
      this.#workspaces = result;
    }
    return result;
  }

  public set workspaces(value: PackageJsonParsed[] | undefined) {
    this.#workspaces = value;
  }

  protected constructor(filePath: string | undefined | null) {
    if (filePath !== undefined && filePath !== null) {
      try {
        this.filePath = path.resolve(filePath);
        this.packageDirectoryPath = path.dirname(this.filePath);
      } catch {}
    }
  }

  public addValidationMessage(err: undefined | null): void;

  public addValidationMessage(err: PackageJsonParseMessage | Error | undefined): void;

  public addValidationMessage(
    severity: PackageJsonParseMessage.Severity,
    message: string,
    field?: string | undefined,
  ): void;

  public addValidationMessage(
    err: PackageJsonParseMessage.Severity | PackageJsonParseMessage | Error | undefined | null,
    message?: string,
    field?: string | undefined | null,
  ): void {
    if (err instanceof Error) {
      message = err.message || "Invalid package.json";
      err = "error";
    }
    if (typeof err === "string") {
      err = new PackageJsonParseMessage(err, message || "Invalid package.json", field || undefined);
    }
    if (err === undefined || err === null) {
      return;
    }
    if (err.severity === "error" && this.validation === "valid") {
      this.validation = "readable";
    }
    if (err.field) {
      if (this.fieldsWithErrors.has(err.field)) {
        return;
      }
      if (err.severity === "error" && !err.field.endsWith("ependencies") && err.field !== "workspaces") {
        this.fieldsWithErrors.add(err.field);
      }
    } else if (err.message === "Invalid package.json" && this.errors.length !== 0) {
      return;
    }
    if (err.field || err.message) {
      const errField = err.field;
      const errMsg = err.message;
      const hasErr = (e: PackageJsonParseMessage) => e.field === errField && e.message === errMsg;
      const found = this.errors.find(hasErr) || this.warnings.find(hasErr) || this.informations.find(hasErr);
      if (found) {
        if (found.severity === err.severity) {
          return;
        }
        switch (found.severity) {
          case "info":
            this.informations.splice(this.informations.indexOf(found), 1);
            break;
          case "warning":
            this.warnings.splice(this.informations.indexOf(found), 1);
            break;
          case "error":
            return;
        }
        found.severity = err.severity;
      }
      switch (err.severity) {
        case "info":
          this.informations.push(err);
          break;
        case "warning":
          this.warnings.push(err);
          break;
        default:
          this.errors.push(err);
          break;
      }
    }
  }

  public validateWorkspaceDependenciesVersions(): void {
    const deps = new Map<string, { pkg: PackageJsonParsed; version: string }>();

    const workspaceNames = new Set<string>();
    for (const workspace of this.workspaces) {
      workspaceNames.add(workspace.content.name);
    }

    if (workspaceNames.size === 0) {
      return;
    }

    const addDependency = (pkg: PackageJsonParsed, field: string, name: string, version: string) => {
      const found = deps.get(name);
      if (found === undefined) {
        deps.set(name, { pkg, version });
        return;
      }

      if (pkg !== this && found.pkg !== pkg && found.version !== version && !workspaceNames.has(name)) {
        pkg.addValidationMessage(
          "warning",
          `Version mismatch. "${name}"="${version}" in ${makePathRelative(found.pkg.filePath)} with version "${
            found.version
          }".`,
          field,
        );
      }
    };

    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      for (const [name, version] of Object.entries(this.content[field])) {
        if (name && typeof name === "string" && version && typeof version === "string") {
          addDependency(this, field, name, version);
        }
      }
    }

    for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
      for (const workspace of this.workspaces) {
        for (const [name, version] of Object.entries(workspace.content[field])) {
          if (name && typeof name === "string" && version && typeof version === "string") {
            addDependency(workspace, field, name, version);
          }
        }
      }
    }

    deps.clear();

    for (const workspace of this.workspaces) {
      for (const [name, version] of Object.entries(workspace.content.peerDependencies)) {
        if (name && typeof name === "string" && version && typeof version === "string") {
          addDependency(workspace, "peerDependencies", name, version);
        }
      }
    }
  }

  public static error(error: unknown, filePath?: string | undefined | null): PackageJsonParsed {
    const result = new PackageJsonParsed(filePath);
    if (error instanceof Error || error instanceof PackageJsonParseMessage) {
      result.addValidationMessage(error);
    } else if (error) {
      result.addValidationMessage("error", `${error}`);
    }
    result.validation = "invalid";
    return result;
  }

  public validationToString(): string {
    let message = "";
    const processFile = (item: PackageJsonParsed) => {
      if (this.errors.length > 0 || item.warnings.length > 0) {
        message += `${makePathRelative(item.filePath)} has ${item.errors.length > 0 ? "errors" : "warnings"}:\n`;
        for (const error of item.errors) {
          message += `    - ${error}\n`;
        }
        for (const warning of item.warnings) {
          message += `    - ${warning}\n`;
        }
        message += "\n";
      }
    };
    processFile(this);
    this.workspaces.forEach(processFile);
    return message;
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
      const pkg = PackageJsonParsed.error(readError, packageJsonFilePath);
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
      if (loaded.validation === "valid" || loaded.validation === "readable") {
        loaded.workspaces = await _loadWorskpcesAsync(packageJsonFilePath, loaded.content);
        if (loaded.validation === "valid" && options?.validateWorkspaceDependenciesVersions) {
          loaded.validateWorkspaceDependenciesVersions();
        }
      }
      return loaded;
    } catch (readError) {
      const pkg = PackageJsonParsed.error(readError, packageJsonFilePath);
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

    let isValid = true;
    let isReadable = true;
    const result = new PackageJsonParsed(options?.filePath);
    result.strict = options?.strict ?? true;

    const addError = result.addValidationMessage.bind(result);

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
      Array.isArray(packageJson) ||
      Buffer.isBuffer(packageJson)
    ) {
      isReadable = false;
      addError(
        new PackageJsonParseMessage(
          "error",
          `package.json must be an object but is ${
            packageJson === null ? "null" : Array.isArray(packageJson) ? "an Array" : `a ${typeof packageJson}`
          }`,
        ),
      );
    }

    if (!isReadable) {
      content = {
        name: "",
        version: "",
        private: true,
        dependencies: {},
        devDependencies: {},
        optionalDependencies: {},
        peerDependencies: {},
      };
    } else {
      if (!_packageJsonValidateSchema(packageJson, addError)) {
        isValid = false;
      }

      try {
        content = JSON.parse(JSON.stringify(packageJson));
      } catch {
        content = { ...content };
      }

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

      const nameValidationResult = PackageJsonParsed.validatePackageName(content.name);
      if (nameValidationResult.status !== "valid") {
        addError(new PackageJsonParseMessage("error", nameValidationResult.message, "name"));
      }
    }

    ({ content, packageNameAndVersion } = _npmNormalizePackageJson(
      _sanitize(content),
      isReadable && result.strict,
      addError,
    ));

    if (!content.name && result.filePath) {
      const parent = path.basename(path.dirname(result.filePath));
      if (parent && path.dirname(parent) !== parent) {
        const base = path.basename(result.filePath);
        content.name = parent.charAt(0) === "@" ? `${parent}/${base}` : base;
      }
    }

    result.packageNameAndVersion =
      packageNameAndVersion || content.version ? `${content.name || ""}@${content.version || ""}` : content.name;

    if (isReadable) {
      _validateDependenciesDefinitions(content, addError);
    }

    if (!isValid && result.validation === "valid") {
      result.validation = "readable";
    }
    if (!isReadable && (result.validation === "valid" || result.validation === "readable")) {
      result.validation = "invalid";
    }
    result.content = content;

    if (isReadable && (options?.loadWorkspaces ?? true) && result.filePath) {
      result.workspaces = _loadWorskpcesSync(result.filePath, content, options);
      console.log(result.validation);
      if (result.validation === "valid" && options?.validateWorkspaceDependenciesVersions) {
        result.validateWorkspaceDependenciesVersions();
      }
    }

    return result;
  }

  public static validatePackageName(packageName: unknown): PackageJsonParsed.PackageNameValidation {
    let scope = "";
    let name = "";
    if (typeof packageName !== "string") {
      return {
        status: "invalid",
        message: `package name cannot be ${
          !packageName ? `${packageName}` : Array.isArray(packageName) ? "an array" : `a ${typeof packageName}`
        }`,
        scope,
        name,
        subPath: "",
      };
    }
    if (packageName.length === 0) {
      return { status: "invalid", message: "package name cannot be empty", scope, name, subPath: "" };
    }
    if (packageName.length === 1) {
      return { status: "invalid", message: "package name must have more than one character", scope, name, subPath: "" };
    }
    if (packageName.length > 214) {
      return {
        status: "invalid",
        message: `package name cannot be longer than 214 character`,
        scope,
        name,
        subPath: "",
      };
    }
    if (packageName.startsWith(".") || packageName.startsWith("_")) {
      return {
        status: "invalid",
        message: `package name cannot start with a "${packageName[0]}"`,
        scope,
        name,
        subPath: "",
      };
    }
    if (packageName.startsWith("node:")) {
      return { status: "invalid", message: `package name cannot start with a "node:"`, scope, name, subPath: "" };
    }
    if (packageName.trim() !== packageName) {
      return {
        status: "invalid",
        message: `package name must not contains spaces before or after`,
        scope,
        name,
        subPath: "",
      };
    }
    if (encodeURIComponent(packageName) !== packageName) {
      // Maybe it's a scoped package name, like @user/package
      const nameMatch = packageName.match(/^(?:@([^/]+?)[/};?([^/]+?)$/);
      if (nameMatch) {
        scope = nameMatch[1] || "";
        name = nameMatch[2] || "";
        if (encodeURIComponent(scope) !== scope && encodeURIComponent(name) !== name) {
          return { status: "invalid", message: `package name cannot contain ("~\\'!()*")`, scope, name, subPath: "" };
        }
      }
    }

    if (packageName.toLowerCase() !== packageName) {
      return {
        status: "valid-only-as-dependency",
        message: `package name cannot contain capital letters`,
        scope,
        name,
        subPath: "",
      };
    }
    if (/[~'!()*\\]/.test(packageName.split("/").slice(-1)[0] || "")) {
      return {
        status: "valid-only-as-dependency",
        message: `package name cannot contain ("~\\'!()*")`,
        scope,
        name,
        subPath: "",
      };
    }

    if (builtinModules.indexOf(packageName) >= 0) {
      return {
        status: "valid-only-as-dependency",
        message: `package name cannot be a node native module`,
        scope,
        name,
        subPath: "",
      };
    }

    return { status: "valid", message: "", scope, name, subPath: "" };
  }

  /** Parses a node package path. Example hello/subpath or @xxx/hello/subpath */
  public static parseNodePackageName = (specifier: string): PackageJsonParsed.ParsedPackageName | null => {
    const first = specifier.charCodeAt(0);
    if (!first) {
      return null;
    }
    let slashIndex = specifier.indexOf("/");
    let scope = "";
    if (first === 64) {
      if (slashIndex < 0) {
        return null;
      }
      scope = specifier.slice(0, slashIndex);
      if (scope.length < 1) {
        return null;
      }
      slashIndex = specifier.indexOf("/", slashIndex + 1);
    }
    const name = slashIndex === -1 ? specifier : specifier.slice(0, slashIndex);
    if (!name || /^\.|%|\\/.exec(name) !== null) {
      return null;
    }
    return {
      scope,
      name,
      subPath: slashIndex < 0 ? "." : path.posix.normalize(`.${specifier.slice(slashIndex)}`),
    };
  };
}

const _dependencyKeys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

let _packageJsonAjvValidator: ValidateFunction<PackageJson.Sanitized> | null = null;

function _readPackageJsonFromFile(
  filePath: string,
  addError: {
    (err: undefined | null): void;
    (err: PackageJsonParseMessage | Error | undefined): void;
    (severity: PackageJsonParseMessage.Severity, message: string, field?: string | undefined): void;
  },
  packageJson: unknown,
  result: PackageJsonParsed,
) {
  let fileContent: string | undefined;
  try {
    filePath = path.resolve(filePath);
    fileContent = fs.readFileSync(filePath, "utf8");
  } catch (e: any) {
    if (e?.code !== "EISDIR") {
      addError(devError(e));
    } else {
      try {
        filePath = path.resolve(filePath, "package.json");
        fileContent = fs.readFileSync(filePath, "utf8");
      } catch (e1) {
        addError(devError(e));
      }
    }
  }
  if (fileContent !== undefined) {
    packageJson = _parsePackageJson(fileContent, addError);
  } else if (result.errors.length <= 0) {
    addError("error", "Could not read package.json");
  }
  try {
    result.filePath = filePath;
    result.packageDirectoryPath = path.dirname(result.filePath);
  } catch {}

  return packageJson;
}

function _parsePackageJson(
  packageJson: unknown,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): unknown {
  if (packageJson !== undefined && packageJson !== null) {
    if (Buffer.isBuffer(packageJson)) {
      packageJson = packageJson.toString();
    }
    if (typeof packageJson !== "string") {
      addError(new PackageJsonParseMessage("error", `Cannot JSON parse a ${typeof packageJson}`));
    } else {
      try {
        packageJson = JSON.parse(toUTF8(packageJson));
      } catch (error: any) {
        addError(new PackageJsonParseMessage("error", `JSON.parse error: ${error?.message}`));
      }
    }
  }
  return packageJson;
}

function _packageJsonValidateSchema(
  packageJson: unknown,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): boolean {
  const ajvValidator = _packageJsonAjvValidator || (_packageJsonAjvValidator = _createAjvValidator());
  let isValid = ajvValidator(packageJson);
  const validationErrors = ajvValidator.errors;
  if (validationErrors && validationErrors.length > 0) {
    ajvValidator.errors = null;
    isValid = false;
    for (let i = 0, len = validationErrors.length; i < len; ++i) {
      addError(_packageJsonValidationErrorFromAjvError(validationErrors[i]!, packageJson));
    }
  }
  return isValid;
}

function _validateDependenciesDefinitions(
  content: PackageJson.Sanitized,
  addError: (err: PackageJsonParseMessage | undefined) => void,
): void {
  const erroredDependencies = new Set<string>();
  for (let i = 0; i < _dependencyKeys.length; ++i) {
    const ka = _dependencyKeys[i]!;
    const da = content[ka] || {};

    // Validate dependency name
    for (const name of Object.keys(da)) {
      if (!erroredDependencies.has(name)) {
        const depNameValidationResult = PackageJsonParsed.validatePackageName(name);
        if (depNameValidationResult.status === "invalid") {
          erroredDependencies.add(name);
          const stringName = JSON.stringify(name);
          addError(new PackageJsonParseMessage("error", depNameValidationResult.message, `${ka}[${stringName}]`));
        }
      }
    }

    // Validates that the same dependency is not repeated in more than one group of dependencies
    for (let j = i + 1; j < _dependencyKeys.length; ++j) {
      const kb = _dependencyKeys[j]!;
      if (ka === "devDependencies" || kb === "devDependencies") {
        const other = ka === "devDependencies" ? kb : ka;
        if (other === "peerDependencies" || other === "optionalDependencies") {
          continue;
        }
      }
      const db = content[kb] || {};
      for (const name of Object.keys(da)) {
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
): { content: PackageJson.Sanitized; packageNameAndVersion: string | undefined } {
  let packageNameAndVersion: string | undefined;
  try {
    const isPrivate = !!content.private;
    const normalizedContent = JSON.parse(JSON.stringify(content)) as PackageJson.Sanitized;
    normalizedContent.private = false;
    normalizePackageData(normalizedContent, (m) => addError(_packageJsonValidatorErrorFromNormalizer(m)), strict);

    if (normalizedContent.dependencies === undefined) {
      normalizedContent.dependencies = {};
    }

    if (normalizedContent.devDependencies === undefined) {
      normalizedContent.devDependencies = {};
    }

    if (normalizedContent.peerDependencies === undefined) {
      normalizedContent.peerDependencies = {};
    }
    if (normalizedContent.optionalDependencies === undefined) {
      normalizedContent.optionalDependencies = {};
    }

    normalizedContent.private = isPrivate;

    if (typeof normalizedContent._id === "string") {
      packageNameAndVersion = normalizedContent._id;
      delete normalizedContent._id;
    }

    const dependencies: Record<string, string> = {};
    if (content.dependencies && normalizedContent.dependencies) {
      for (const [name, version] of Object.entries(normalizedContent.dependencies)) {
        if (name in content.dependencies) {
          dependencies[name] = version;
        }
      }
    }
    normalizedContent.dependencies = dependencies;
    content = normalizedContent;
  } catch (error: any) {
    let errorMessage = error?.message;
    if (typeof errorMessage !== "string" || !errorMessage) {
      errorMessage = "Invalid package.json";
    }
    let field: string | undefined;
    if (errorMessage.startsWith("name field must be a string")) {
      field = "name";
    } else if (errorMessage.startsWith("Invalid version:")) {
      field = "version";
    }
    addError(new PackageJsonParseMessage("error", errorMessage, field));
  }
  return { content: content as PackageJson.Sanitized, packageNameAndVersion };
}

function _packageJsonValidatorErrorFromNormalizer(msg: string | undefined) {
  if (typeof msg !== "string" || !msg) {
    return undefined;
  }
  if (msg.endsWith(".")) {
    msg = msg.slice(0, -1);
  }
  let severity: PackageJsonParseMessage.Severity = "warning";
  let field: string | undefined;
  switch (msg) {
    case "No repository field":
      severity = "info";
      break;

    case "No README data":
      severity = "info";
      break;
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
      content === null ? "null" : Array.isArray(content) ? "an Array" : `a ${typeof content}`
    }`;
  }
  return new PackageJsonParseMessage("error", message, prop);
}

function _createAjvValidator(): ValidateFunction<PackageJson.Sanitized> {
  const packageJsonSchema = require("../../package-json.schema.json");
  return new Ajv({
    validateSchema: false,
    false: true,
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

function _sanitize(input: PackageJson): PackageJson.Sanitized {
  const result = { ...input };

  for (const key of ["name", "version", "description", "homepage", "license", "type", "main", "types", "module"]) {
    if (result[key] !== undefined && typeof result[key] !== "string") {
      delete result[key];
    }
  }

  result.private = !!result.private;
  if (result.flat && typeof result.flat !== "boolean") {
    result.flat = !!result.flat;
  }

  if (result.dependencies === undefined) {
    result.dependencies = {};
  }

  if (result.devDependencies === undefined) {
    result.devDependencies = {};
  }

  if (result.peerDependencies === undefined) {
    result.peerDependencies = {};
  }
  if (result.optionalDependencies === undefined) {
    result.optionalDependencies = {};
  }

  result.name = result.name?.trim();
  result.version = result.version?.trim();
  if (!result.name) {
    result.name = "";
  }
  if (!result.version) {
    result.version = "0.0.0";
  }

  return result as PackageJson.Sanitized;
}

async function _loadWorskpcesAsync(
  packageJsonPath: string,
  packageJson: PackageJson,
  options?: PackageJsonParsed.ReadOptions,
): Promise<PackageJsonParsed[]> {
  // Implementation based on https://github.com/npm/map-workspaces

  if (Buffer.isBuffer(packageJson) || typeof packageJson === "string") {
    packageJson = JSON.parse(toUTF8(packageJson));
  }

  packageJsonPath = path.resolve(packageJsonPath);
  const cwd = path.dirname(packageJsonPath);
  if (cwd.includes(`${path.sep}node_modules${path.sep}`)) {
    return [];
  }

  const seen = new Map<string, Set<string>>();

  const globOptions: glob.Options = { cwd, absolute: true, ignore: ["**/node_modules/**", "**/.git/**"] };
  const globsResult = (
    await Promise.all(
      _workspaceGetPatterns(packageJson.workspaces).map(async (pattern) => ({
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

  if (Buffer.isBuffer(packageJson) || typeof packageJson === "string") {
    packageJson = JSON.parse(toUTF8(packageJson));
  }

  packageJsonPath = path.resolve(packageJsonPath);
  const cwd = path.dirname(packageJsonPath);
  if (cwd.includes(`${path.sep}node_modules${path.sep}`)) {
    return [];
  }

  const seen = new Map<string, Set<string>>();
  const globOptions: glob.Options = {
    cwd,
    absolute: true,
    onlyFiles: false,
    ignore: ["**/node_modules/**", "**/.git/**"],
  };

  const loaded = new Map<string, PackageJsonParsed>();
  const pkgsByName = new Map<string, PackageJsonParsed>();
  const loadChildOptions = { ...options, loadWorkspaces: false };
  for (const pattern of _workspaceGetPatterns(packageJson.workspaces)) {
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
        pkgsByName.set((pkg.validation === "readable" && pkg.content.name) || match, pkg);
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
          found.addValidationMessage(
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

function _workspaceGetPatterns(workspaces: string[] | PackageJson.WorkspaceConfig | undefined) {
  // Implementation based on https://github.com/npm/map-workspaces

  const results = [];
  const patterns = workspaces
    ? Array.isArray(workspaces)
      ? workspaces
      : Array.isArray(workspaces.packages)
      ? workspaces.packages
      : []
    : [];

  let index = 0;
  for (let pattern of patterns) {
    const excl = pattern.match(/^!+/);
    if (excl) {
      pattern = pattern.slice(excl[0]?.length ?? 0);
    }

    // strip off any / from the start of the pattern.  /foo => foo
    pattern = pattern.replace(/^\/+/, "");

    // an odd number of ! means a negated pattern.  !!foo ==> foo
    const negate = !!(excl && excl[0]!.length % 2 === 1);

    pattern = pattern.replace(/\\/g, "/");
    pattern = `${pattern.endsWith("/") ? pattern : `${pattern}/`}package.json`;

    results.push({ pattern, negate, index: index++ });
  }

  return results;
}
