import { builtinModules } from "node:module";
import path from "node:path";
import { plainObjects } from "../utils/plain-objects";

const { isArray } = Array;
const { keys: objectKeys } = Object;

/** Type for [npm's `package.json` file](https://docs.npmjs.com/creating-a-package-json-file). */
export interface PackageJson {
  [key: string]: unknown;

  /** The name of the package. */
  name?: string | undefined;

  /** Package version, parsable by [`node-semver`](https://github.com/npm/node-semver). */
  version?: string | undefined;

  /** Package description, listed in `npm search`. */
  description?: string | undefined;

  /** Keywords associated with package, listed in `npm search`. */
  keywords?: string[] | undefined;

  /** The URL to the package's homepage. */
  homepage?: string | undefined;

  /** The URL to the package's issue tracker and/or the email address to which issues should be reported. */
  bugs?: string | { url?: string; email?: string } | undefined;

  /** The license for the package. */
  license?: string | undefined;

  /** The licenses for the package. */
  licenses?: { type?: string; url?: string }[] | undefined;

  author?: string | { name: string; url?: string; email?: string } | undefined;

  /** A list of people who contributed to the package. */
  contributors?: (string | { name: string; url?: string; email?: string })[] | undefined;

  /** A list of people who maintain the package. */
  maintainers?: (string | { name: string; url?: string; email?: string })[] | undefined;

  /** The files included in the package. */
  files?: string[] | undefined;

  /** Resolution algorithm for importing ".js" files from the package's scope. [Read more.](https://nodejs.org/api/esm.html#esm_package_json_type_field) */
  type?: "module" | "commonjs" | string | undefined;

  /** The module ID that is the primary entry point to the program. */
  main?: string | undefined;

  /** Standard entry points of the package, with enhanced support for ECMAScript Modules. [Read more.](https://nodejs.org/api/esm.html#esm_package_entry_points) */
  exports?: PackageJson.Exports | undefined;

  /** Entries in the imports field must be strings starting with #. Import maps permit mapping to external packages. This field defines subpath imports for the current package. */
  imports?: PackageJson.Imports | undefined;

  /** The executable files that should be installed into the `PATH`. */
  bin?: string | Record<string, string> | undefined;

  /** Filenames to put in place for the `man` program to find. */
  man?: string | string[] | undefined;

  /** Indicates the structure of the package. */
  directories?: PackageJson.Directories | undefined;

  /** Location for the code repository. */
  repository?: string | PackageJson.Repository | undefined;

  /** Script commands that are run at various times in the lifecycle of the package. The key is the lifecycle event, and the value is the command to run at that point. */
  scripts?: PackageJson.Scripts | undefined;

  /** Is used to set configuration parameters used in package scripts that persist across upgrades. */
  config?: Record<string, unknown> | undefined;

  /** The dependencies of the package. */
  dependencies?: Record<string, string> | undefined;

  /** Additional tooling dependencies that are not required for the package to work. Usually test, build, or documentation tooling. */
  devDependencies?: Record<string, string> | undefined;

  /** Dependencies that are skipped if they fail to install. */
  optionalDependencies?: Record<string, string> | undefined;

  /** Dependencies that will usually be required by the package user directly or via another dependency. */
  peerDependencies?: Record<string, string> | undefined;

  /** Indicate peer dependencies that are optional. */
  peerDependenciesMeta?: Record<string, { optional: true }> | undefined;

  /** Package names that are bundled when the package is published. */
  bundledDependencies?: string[] | undefined;

  /** Alias of `bundledDependencies`. */
  bundleDependencies?: string[] | undefined;

  /** Engines that this package runs on. */
  engines?: PackageJson.Engines | undefined;

  /** Operating systems the module runs on. */
  os?: PackageJson.OS[] | undefined;

  /** CPU architectures the module runs on. */
  cpu?: PackageJson.CPU[] | undefined;

  /** If set to `true`, then npm will refuse to publish it. */
  private?: boolean | undefined;

  /** A set of config values that will be used at publish-time. It's especially handy to set the tag, registry or access, to ensure that a given package is not tagged with 'latest', published to the global public registry or that a scoped module is private by default. */
  publishConfig?: PackageJson.PublishConfig | undefined;

  /** Describes and notifies consumers of a package's monetary support information. [Read more.](https://github.com/npm/rfcs/blob/latest/accepted/0017-add-funding-support.md) */
  funding?: string | { type?: string; url: string } | undefined;

  /** JSPM configuration.	*/
  jspm?: PackageJson | undefined;

  /** Location of the bundled TypeScript declaration file. */
  types?: string | undefined;

  /** Version selection map of TypeScript. */
  typesVersions?: Record<string, Record<string, string[] | undefined>> | undefined;

  /** Location of the bundled TypeScript declaration file. Alias of `types`. */
  typings?: string | undefined;

  /** An ECMAScript module ID that is the primary entry point to the program. */
  module?: string | undefined;

  /** A module ID with non transpiled code that is the primary entry point to the program. */
  esnext?:
    | string
    | { [moduleName: string]: string | undefined; main?: string | undefined; browser?: string | undefined }
    | undefined;

  /** A hint to JavaScript bundlers or component tools when packaging modules for client side use. */
  browser?: string | Record<string, string | false>;

  /** Denote which files in your project are "pure" and therefore safe for Webpack to prune if unused. [Read more.](https://webpack.js.org/guides/tree-shaking/) */
  sideEffects?: boolean | string[] | undefined;

  /** Used to configure [Yarn workspaces](https://classic.yarnpkg.com/docs/workspaces/).
   * Workspaces allow you to manage multiple packages within the same repository in such a way that you only need to run `yarn install` once to install all of them in a single pass.
   * Please note that the top-level `private` property of `package.json` **must** be set to `true` in order to use workspaces.
   */
  workspaces?: string[] | PackageJson.WorkspaceConfig | undefined;

  /**
   * If your package only allows one version of a given dependency, and you’d like to enforce the same behavior as `yarn install --flat` on the command-line, set this to `true`.
   * Note that if your `package.json` contains `"flat": true` and other packages depend on yours (e.g. you are building a library rather than an app),
   * those other packages will also need `"flat": true` in their `package.json` or be installed with `yarn install --flat` on the command-line.
   */
  flat?: boolean | undefined;

  /** Selective version resolutions. Allows the definition of custom package versions inside dependencies without manual edits in the `yarn.lock` file. */
  resolutions?: Record<string, string> | undefined;
}

export namespace PackageJson {
  /** Conditions which provide a way to resolve a package entry point based on the environment. */
  export type ExportCondition =
    | "import"
    | "require"
    | "node"
    | "deno"
    | "browser"
    | "electron"
    | "react-native"
    | "default";

  export type Imports = Record<string, Record<string, string>>;

  /** Entry points of a module, optionally with conditions and subpath exports. */
  export type Exports =
    | string
    | string[]
    | { [key in ExportCondition]?: Exports | undefined }
    | { [key: string]: Exports | undefined }
    | undefined;

  /** An alternative configuration for Yarn workspaces. */
  export interface WorkspaceConfig {
    /** An array of workspace pattern strings which contain the workspace packages. */
    packages?: string[] | undefined;

    /**
     * Designed to solve the problem of packages which break when their `node_modules` are moved to the root workspace directory -
     * a process known as hoisting. For these packages, both within your workspace, and also some that have been installed via `node_modules`,
     * it is important to have a mechanism for preventing the default Yarn workspace behavior. By adding workspace pattern strings here,
     * Yarn will resume non-workspace behavior for any package which matches the defined patterns. [Read more](https://classic.yarnpkg.com/blog/2018/02/15/nohoist/)
     */
    nohoist?: string[] | undefined;
  }

  export interface PublishConfig {
    /** Additional, less common properties from the [npm docs on `publishConfig`](https://docs.npmjs.com/cli/v7/configuring-npm/package-json#publishconfig). */
    [additionalProperties: string]: unknown | undefined;

    /** When publishing scoped packages, the access level defaults to restricted. If you want your scoped package to be publicly viewable (and installable) set `--access=public`. The only valid values for access are public and restricted. Unscoped packages always have an access level of public. */
    access?: "public" | "restricted" | undefined;

    /** The base URL of the npm registry. Default: `'https://registry.npmjs.org/'` */
    registry?: string | undefined;

    /** The tag to publish the package under. Default: `'latest'` */
    tag?: string | undefined;
  }

  export type Scripts = {
    /** Run **before** the package is published (Also run on local `npm install` without any arguments). */
    prepublish?: string | undefined;

    /** Run both **before** the package is packed and published, and on local `npm install` without any arguments. This is run **after** `prepublish`, but **before** `prepublishOnly`. */
    prepare?: string | undefined;

    /** Run **before** the package is prepared and packed, **only** on `npm publish`. */
    prepublishOnly?: string | undefined;

    /** Run **before** a tarball is packed (on `npm pack`, `npm publish`, and when installing git dependencies). */
    prepack?: string | undefined;

    /** Run **after** the tarball has been generated and moved to its final destination. */
    postpack?: string | undefined;

    /** Run **after** the package is published. */
    publish?: string | undefined;

    /** Run **after** the package is published. */
    postpublish?: string | undefined;

    /** Run **before** the package is installed. */
    preinstall?: string | undefined;

    /** Run **after** the package is installed. */
    install?: string | undefined;

    /** Run **after** the package is installed and after `install`. */
    postinstall?: string | undefined;

    /** Run **before** the package is uninstalled and before `uninstall`. */
    preuninstall?: string | undefined;

    /** Run **before** the package is uninstalled. */
    uninstall?: string | undefined;

    /** Run **after** the package is uninstalled. */
    postuninstall?: string | undefined;

    /** Run **before** bump the package version and before `version`. */
    preversion?: string | undefined;

    /** Run **before** bump the package version. */
    version?: string | undefined;

    /** Run **after** bump the package version. */
    postversion?: string | undefined;

    /** Run with the `npm test` command, before `test`. */
    pretest?: string | undefined;

    /** Run with the `npm test` command. */
    test?: string | undefined;

    /** Run with the `npm test` command, after `test`. */
    posttest?: string | undefined;

    /** Run with the `npm stop` command, before `stop`. */
    prestop?: string | undefined;

    /** Run with the `npm stop` command. */
    stop?: string | undefined;

    /** Run with the `npm stop` command, after `stop`. */
    poststop?: string | undefined;

    /** Run with the `npm start` command, before `start`. */
    prestart?: string | undefined;

    /** Run with the `npm start` command. */
    start?: string | undefined;

    /** Run with the `npm start` command, after `start`. */
    poststart?: string | undefined;

    /** Run with the `npm restart` command, before `restart`. Note: `npm restart` will run the `stop` and `start` scripts if no `restart` script is provided. */
    prerestart?: string | undefined;

    /** Run with the `npm restart` command. Note: `npm restart` will run the `stop` and `start` scripts if no `restart` script is provided. */
    restart?: string | undefined;

    /** Run with the `npm restart` command, after `restart`. Note: `npm restart` will run the `stop` and `start` scripts if no `restart` script is provided. */
    postrestart?: string | undefined;
  } & Record<string, string>;

  export interface Directories {
    [directoryType: string]: unknown | undefined;

    /** Source folder for a package with source code */
    src?: string | undefined;

    source?: string | undefined;

    /** Dist folder for a package with source code */
    dist?: string | undefined;

    /** Location for executable scripts. Sugar to generate entries in the `bin` property by walking the folder. */
    bin?: string | undefined;

    /** Location for Markdown files. */
    doc?: string | undefined;

    /** Location for example scripts. */
    example?: string | undefined;

    /** Location for the bulk of the library. */
    lib?: string | undefined;

    /** Location for man pages. Sugar to generate a `man` array by walking the folder. */
    man?: string | undefined;

    /** Location for test files. */
    test?: string | undefined;
  }

  export interface Repository {
    type: string;
    url: string;
    /**
     * Relative path to package.json if it is placed in non-root directory (for example if it is part of a monorepo).
     * [Read more.](https://github.com/npm/rfcs/blob/latest/implemented/0010-monorepo-subdirectory-declaration.md)
     */
    directory?: string | undefined;
  }

  export type Engines = { [EngineName in "npm" | "node" | string]: string };

  export type OS =
    | "aix"
    | "darwin"
    | "freebsd"
    | "linux"
    | "openbsd"
    | "sunos"
    | "win32"
    | "!aix"
    | "!darwin"
    | "!freebsd"
    | "!linux"
    | "!openbsd"
    | "!sunos"
    | "!win32"
    | string;

  export type CPU =
    | "arm"
    | "arm64"
    | "ia32"
    | "mips"
    | "mipsel"
    | "ppc"
    | "ppc64"
    | "s390"
    | "s390x"
    | "x32"
    | "x64"
    | "!arm"
    | "!arm64"
    | "!ia32"
    | "!mips"
    | "!mipsel"
    | "!ppc"
    | "!ppc64"
    | "!s390"
    | "!s390x"
    | "!x32"
    | "!x64"
    | string;

  export interface Sanitized extends PackageJson {
    name: string;
    version: string;
    private: boolean;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
    bundledDependencies: string[];
    bundleDependencies: undefined;
  }

  export namespace Sanitized {
    export function empty(): Sanitized {
      return {
        name: "",
        version: "",
        private: true,
        dependencies: {},
        devDependencies: {},
        optionalDependencies: {},
        peerDependencies: {},
        bundledDependencies: [],
        bundleDependencies: undefined,
      };
    }
  }

  export const dependencyFields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;

  export const sortableFields = [
    "prettier",
    "engines",
    "engineStrict",
    "bundleDependencies",
    "bundledDependencies",
    "peerDependencies",
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ];

  export const fieldsSortOrder = [
    "name",
    "version",
    "private",
    "description",
    "keywords",
    "license",
    "author",
    "homepage",
    "bugs",
    "repository",
    "contributors",
    "os",
    "cpu",
    "engines",
    "engineStrict",
    "sideEffects",
    "main",
    "umd:main",
    "type",
    "types",
    "typings",
    "bin",
    "browser",
    "files",
    "directories",
    "unpkg",
    "module",
    "source",
    "jsnext:main",
    "style",
    "example",
    "examplestyle",
    "assets",
    "man",
    "workspaces",
    "scripts",
    "betterScripts",
    "husky",
    "pre-commit",
    "commitlint",
    "config",
    "nodemonConfig",
    "browserify",
    "babel",
    "browserslist",
    "xo",
    "eslintConfig",
    "eslintIgnore",
    "stylelint",
    "jest",
    "flat",
    "resolutions",
    "preferGlobal",
    "publishConfig",
    "@balsamic",
    "bundleDependencies",
    "bundledDependencies",
    "peerDependencies",
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "prettier",
    "lint-staged",
  ];

  export function sortPackageJsonFields<T extends PackageJson>(packageJson: T): T {
    if (typeof packageJson !== "object" || packageJson === null || isArray(packageJson)) {
      return packageJson;
    }
    const map = new Map();
    for (const key of PackageJson.fieldsSortOrder) {
      if (packageJson[key] !== undefined) {
        map.set(key, packageJson[key]);
      }
    }
    for (const key of objectKeys(packageJson)) {
      if (packageJson[key] !== undefined) {
        map.set(key, packageJson[key]);
      }
    }

    const result: PackageJson = {};
    for (const [key, value] of map) {
      result[key] = value;
    }
    for (const key of PackageJson.sortableFields) {
      if (typeof result[key] === "object" && result[key] !== null) {
        const v = result[key];
        if (isArray(v)) {
          if (v.length === 0) {
            delete result[key];
          } else {
            v.sort();
          }
        } else {
          const sorted = plainObjects.sortObjectKeys(v as Record<string, unknown>);
          if (objectKeys(sorted).length === 0) {
            delete result[key];
          } else {
            result[key] = sorted;
          }
        }
      }
    }
    return result as T;
  }

  export interface PackageNameValidation {
    status: "valid" | "valid-only-as-dependency" | "invalid";
    message: string;
    scope: string;
    name: string;
  }

  export function validatePackageName(packageName: unknown): PackageNameValidation {
    let scope = "";
    let name = "";
    if (typeof packageName !== "string") {
      return {
        status: "invalid",
        message: `package name cannot be ${
          !packageName ? `${packageName}` : isArray(packageName) ? "an array" : `a ${typeof packageName}`
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

  export interface ParsedPackageName {
    scope: string;
    name: string;
    subPath: string;
  }

  /** Parses a node package path. Example hello/subpath or @xxx/hello/subpath */
  export function parsePackageName(specifier: string): ParsedPackageName | null {
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
  }

  export function sanitize(input: PackageJson): PackageJson.Sanitized {
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

    for (const k of dependencyFields) {
      if (result[k] === undefined) {
        result[k] = {};
      }
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
}
