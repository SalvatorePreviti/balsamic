/// <reference path="../../types/normalize-package-data.d.ts" />
/// <reference path="../../types/validate-npm-package-name.d.ts" />

import path from "node:path";
import type { PackageJson as SimplePackageJson } from "@balsamic/dev";
import Ajv, { ValidateFunction, ErrorObject, SchemaObject } from "ajv";
import packageJsonSchema from "./package-json-schema.json";
import normalizePackageData from "normalize-package-data";
import validatePackageName from "validate-npm-package-name";

export interface ValidatedPackageJson extends SimplePackageJson {
  name: string;

  version: string;

  private: boolean;

  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
}

export type PackageJsonValidationErrorSeverity = "warning" | "error" | "info";

export class PackageJsonValidationError {
  public constructor(
    public property: string | undefined,
    public message: string,
    public severity: PackageJsonValidationErrorSeverity = "error",
  ) {}

  public toString(): string {
    let result = this.severity || "error";
    result += ": ";
    if (this.property) {
      result += this.property;
      result += ": ";
    }
    return result + this.message;
  }
}

interface PackageJsonValidationResultBase {
  isValid: boolean;
  content: ValidatedPackageJson | unknown;
  filePath: string | undefined;
  packageDirectoryPath: string | undefined;
  packageNameAndVersion: string | undefined;
  errors: PackageJsonValidationError[];
  warnings: PackageJsonValidationError[];
  informations: PackageJsonValidationError[];
}

export interface PackageJsonJsonValidationOk extends PackageJsonValidationResultBase {
  isValid: true;
  content: ValidatedPackageJson;
  packageNameAndVersion: string;
}

export interface PackageJsonJsonValidationFailed extends PackageJsonValidationResultBase {
  isValid: false;
}

export type PackageJsonValidationResult = PackageJsonJsonValidationOk | PackageJsonJsonValidationFailed;

export namespace packageJsonValidate {
  export interface Options {
    filePath?: string | undefined;
    strict?: boolean | undefined;

    /** If true, the input is considered as a JSON string (or Buffer). */
    parseFromJSON?: boolean | undefined;
  }
}

const _dependencyKeys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

export function packageJsonValidate(
  packageJson: ValidatedPackageJson | string | Buffer | unknown,
  options?: packageJsonValidate.Options | undefined,
): PackageJsonValidationResult {
  const errors: PackageJsonValidationError[] = [];
  const warnings: PackageJsonValidationError[] = [];
  const informations: PackageJsonValidationError[] = [];
  const messagesSet = new Set<string>();
  const errorFieldsSet = new Set<string>();

  let isValid = true;

  let filePath: string | undefined;
  let packageDirectoryPath: string | undefined;
  if (options?.filePath) {
    try {
      filePath = path.resolve(options.filePath);
      packageDirectoryPath = path.dirname(filePath);
    } catch {}
  }

  const addError = (err: PackageJsonValidationError | undefined): void => {
    if (!err) {
      return;
    }
    isValid = isValid && err.severity !== "error";
    if (err.property) {
      if (errorFieldsSet.has(err.property)) {
        return;
      }
      if (err.severity === "error" && !err.property.endsWith("ependencies")) {
        errorFieldsSet.add(err.property);
      }
    } else if (err.message === "Invalid package.json" && errors.length !== 0) {
      return;
    }
    if (err.property || err.message) {
      const str = err.toString();
      if (!messagesSet.has(str)) {
        messagesSet.add(str);
        switch (err.severity) {
          case "info":
            informations.push(err);
            break;
          case "warning":
            warnings.push(err);
            break;
          default:
            errors.push(err);
            break;
        }
      }
    }
  };

  if (options?.parseFromJSON) {
    packageJson = _parsePackageJson(packageJson, addError);
  }

  let content = packageJson as ValidatedPackageJson;
  let packageNameAndVersion: string | undefined;

  if (isValid) {
    if (typeof packageJson !== "object" || packageJson === null || Array.isArray(packageJson)) {
      addError(
        new PackageJsonValidationError(
          undefined,
          `package.json must be an object but is ${
            packageJson === null ? "null" : Array.isArray(packageJson) ? "an Array" : `a ${typeof packageJson}`
          }`,
        ),
      );
    } else {
      if (!_packageJsonValidateSchema(packageJson, addError)) {
        isValid = false;
      }

      content = JSON.parse(JSON.stringify(packageJson)) as ValidatedPackageJson;

      if (content.version === undefined) {
        addError(new PackageJsonValidationError("version", "No version", "error"));
      }

      if (content.private === undefined) {
        addError(new PackageJsonValidationError("private", "private field should be true or false", "warning"));
      }

      const nameValidationResult = validatePackageName(content.name);
      if (!nameValidationResult.validForNewPackages) {
        addError(new PackageJsonValidationError("name", nameValidationResult.errors?.[0] || "Invalid package name"));
      }

      ({ content, packageNameAndVersion } = _npmNormalizePackageJson(content, options?.strict, addError));

      if (isValid) {
        if (!packageNameAndVersion) {
          packageNameAndVersion = `${content.name?.trim() || ""}@${content.version?.trim() || ""}`;
        }

        _validateDependenciesDefinitions(content, addError);
      }
    }
  }

  const result: PackageJsonValidationResultBase = {
    isValid,
    content,
    filePath,
    packageDirectoryPath,
    packageNameAndVersion,
    errors,
    warnings,
    informations,
  };

  return result as PackageJsonValidationResult;
}

let _packageJsonAjvValidator: ValidateFunction<ValidatedPackageJson> | null = null;

function _parsePackageJson(
  packageJson: unknown,
  addError: (err: PackageJsonValidationError | undefined) => void,
): unknown {
  if (packageJson !== undefined && packageJson !== null) {
    if (Buffer.isBuffer(packageJson)) {
      packageJson = packageJson.toString();
    }
    if (typeof packageJson !== "string") {
      addError(new PackageJsonValidationError(undefined, `Cannot JSON parse a ${typeof packageJson}`));
    } else {
      try {
        if (packageJson.charCodeAt(0) === 0xfeff) {
          packageJson = packageJson.slice(1);
        }
        packageJson = JSON.parse(packageJson as string);
      } catch (error: any) {
        addError(new PackageJsonValidationError(undefined, `JSON.parse error: ${error?.message}`));
      }
    }
  }
  return packageJson;
}

/** The JSON schema used to validate package.json files. */
packageJsonValidate.jsonSchema = packageJsonSchema as SchemaObject;

function _packageJsonValidateSchema(
  packageJson: unknown,
  addError: (err: PackageJsonValidationError | undefined) => void,
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
  content: ValidatedPackageJson,
  addError: (err: PackageJsonValidationError | undefined) => void,
): void {
  const erroredDependencies = new Set<string>();
  for (let i = 0; i < _dependencyKeys.length; ++i) {
    const ka = _dependencyKeys[i]!;
    const da = content[ka] || {};

    // Validate dependency name
    for (const name of Object.keys(da)) {
      if (!erroredDependencies.has(name)) {
        const depNameValidationResult = validatePackageName(name);
        if (!depNameValidationResult.validForOldPackages) {
          erroredDependencies.add(name);
          const stringName = JSON.stringify(name);
          addError(
            new PackageJsonValidationError(
              `${ka}[${stringName}]`,
              depNameValidationResult.errors?.[0] || "Invalid package name",
            ),
          );
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
            new PackageJsonValidationError(`${kb}[${stringName}]`, `Dependency "${name}" is both in ${ka} and ${kb}`),
          );
        }
      }
    }
  }
}

function _npmNormalizePackageJson(
  content: SimplePackageJson,
  strict: boolean | undefined,
  addError: (err: PackageJsonValidationError | undefined) => void,
): { content: ValidatedPackageJson; packageNameAndVersion: string | undefined } {
  let packageNameAndVersion: string | undefined;
  try {
    const isPrivate = !!content.private;
    const normalizedContent = JSON.parse(JSON.stringify(content)) as ValidatedPackageJson;
    normalizedContent.private = false;
    normalizePackageData(
      normalizedContent,
      (msg) => addError(_packageJsonValidatorErrorFromNormalizer(msg)),
      strict ?? true,
    );

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
    addError(new PackageJsonValidationError(field, errorMessage, "error"));
  }
  return { content: content as ValidatedPackageJson, packageNameAndVersion };
}

function _packageJsonValidatorErrorFromNormalizer(msg: string | undefined) {
  if (typeof msg !== "string" || !msg) {
    return undefined;
  }
  if (msg.endsWith(".")) {
    msg = msg.slice(0, -1);
  }
  let severity: PackageJsonValidationErrorSeverity = "warning";
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

  return new PackageJsonValidationError(field || undefined, msg, severity);
}

function _packageJsonValidationErrorFromAjvError(
  error: ErrorObject,
  content: unknown,
): PackageJsonValidationError | undefined {
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
  return new PackageJsonValidationError(prop, message);
}

function _createAjvValidator(): ValidateFunction<ValidatedPackageJson> {
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
  }).compile(packageJsonValidate.jsonSchema);
}
