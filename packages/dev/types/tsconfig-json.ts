import type { UnsafeAny } from ".";

export interface TsconfigJson {
  /** Path to base configuration file to inherit from. Requires TypeScript version 2.1 or later. */
  extends?: string | undefined;

  /** Instructs the TypeScript compiler how to compile .ts files. */
  compilerOptions?: TsconfigJson.CompilerOptions | undefined;

  /** Enable Compile-on-Save for this project. */
  compileOnSave?: boolean | undefined;

  /** Auto type (.d.ts) acquisition options for this project. Requires TypeScript version 2.1 or later. */
  typeAcquisition?:
    | {
        /** Enable auto type acquisition */
        enable?: boolean | undefined;
        /** Specifies a list of type declarations to be included in auto type acquisition. Ex. ["jquery", "lodash"] */
        include?: string[] | undefined;
        /** Specifies a list of type declarations to be excluded from auto type acquisition. Ex. ["jquery", "lodash"] */
        exclude?: string[] | undefined;

        [k: string]: unknown;
      }
    | undefined;

  watchOptions?: TsconfigJson.WatchOptions | undefined;

  buildOptions?: TsconfigJson.BuildOptions | undefined;

  "ts-node"?: TsconfigJson.TsNodeOptions | undefined;

  /** If no 'files' or 'include' property is present in a tsconfig.json, the compiler defaults to including all files in the containing directory and subdirectories except those specified by 'exclude'. When a 'files' property is specified, only those files and those specified by 'include' are included. */
  files?: string[] | undefined;

  /** Specifies a list of files to be excluded from compilation. The 'exclude' property only affects the files included via the 'include' property and not the 'files' property. Glob patterns require TypeScript version 2.0 or later. */
  exclude?: string[] | undefined;

  /** Specifies a list of glob patterns that match files to be included in compilation. If no 'files' or 'include' property is present in a tsconfig.json, the compiler defaults to including all files in the containing directory and subdirectories except those specified by 'exclude'. Requires TypeScript version 2.0 or later. */
  include?: string[] | undefined;

  /** Referenced projects. Requires TypeScript version 3.0 or later. */
  references?:
    | {
        /** Path to referenced tsconfig or to folder containing tsconfig. */
        path?: string | undefined;
        [k: string]: unknown | undefined;
      }[]
    | undefined;

  [k: string]: unknown | undefined;
}

export namespace TsconfigJson {
  export interface CompilerOptions {
    /** No longer supported. In early versions, manually set the text encoding for reading files. */
    charset?: string | undefined;
    /** Enable constraints that allow a TypeScript project to be used with project references. */
    composite?: boolean | undefined;
    /** Generate .d.ts files from TypeScript and JavaScript files in your project. */
    declaration?: boolean | undefined;
    /** Specify the output directory for generated declaration files. */
    declarationDir?: string | null | undefined;
    /** Output compiler performance information after building. */
    diagnostics?: boolean | undefined;
    /** Reduce the number of projects loaded automatically by TypeScript. */
    disableReferencedProjectLoad?: boolean | undefined;
    /** Enforces using indexed accessors for keys declared using an indexed type */
    noPropertyAccessFromIndexSignature?: boolean | undefined;
    /** Emit a UTF-8 Byte Order Mark (BOM) in the beginning of output files. */
    emitBOM?: boolean | undefined;
    /** Only output d.ts files and not JavaScript files. */
    emitDeclarationOnly?: boolean | undefined;
    /** Differentiate between undefined and not present when type checking */
    exactOptionalPropertyTypes?: boolean | undefined;
    /** Enable incremental compilation. Requires TypeScript version 3.4 or later. */
    incremental?: boolean | undefined;
    /** Specify the folder for .tsbuildinfo incremental compilation files. */
    tsBuildInfoFile?: string | undefined;
    /** Include sourcemap files inside the emitted JavaScript. */
    inlineSourceMap?: boolean | undefined;
    /** Include source code in the sourcemaps inside the emitted JavaScript. */
    inlineSources?: boolean | undefined;
    /** Specify what JSX code is generated. */
    jsx?: "preserve" | "react" | "react-jsx" | "react-jsxdev" | "react-native" | string | undefined;
    /** Specify the object invoked for `createElement`. This only applies when targeting `react` JSX emit. */
    reactNamespace?: string | undefined;
    /** Specify the JSX factory function used when targeting React JSX emit, e.g. 'React.createElement' or 'h' */
    jsxFactory?: string | undefined;
    /** Specify the JSX Fragment reference used for fragments when targeting React JSX emit e.g. 'React.Fragment' or 'Fragment'. */
    jsxFragmentFactory?: string | undefined;
    /** Specify module specifier used to import the JSX factory functions when using `jsx: react-jsx`. */
    jsxImportSource?: string | undefined;
    /** Print all of the files read during the compilation. */
    listFiles?: boolean | undefined;
    /** Specify the location where debugger should locate map files instead of generated locations. */
    mapRoot?: string | undefined;
    /** Specify what module code is generated. */
    module?: string | undefined;
    /** Specify how TypeScript looks up a file from a given module specifier. */
    moduleResolution?: "Classic" | "Node" | string | undefined;
    /** Set the newline character for emitting files. */
    newLine?: "crlf" | "lf" | undefined;
    /** Disable emitting file from a compilation. */
    noEmit?: boolean | undefined;
    /** Disable generating custom helper functions like `__extends` in compiled output. */
    noEmitHelpers?: boolean | undefined;
    /** Disable emitting files if any type checking errors are reported. */
    noEmitOnError?: boolean | undefined;
    /** Enable error reporting for expressions and declarations with an implied `any` type. */
    noImplicitAny?: boolean | undefined;
    /** Enable error reporting when `this` is given the type `any`. */
    noImplicitThis?: boolean | undefined;
    /** Enable error reporting when a local variables aren't read. */
    noUnusedLocals?: boolean | undefined;
    /** Raise an error when a function parameter isn't read */
    noUnusedParameters?: boolean | undefined;
    /** Disable including any library files, including the default lib.d.ts. */
    noLib?: boolean | undefined;
    /** Disallow `import`s, `require`s or `<reference>`s from expanding the number of files TypeScript should add to a project. */
    noResolve?: boolean | undefined;
    /** Disable strict checking of generic signatures in function types. */
    noStrictGenericChecks?: boolean | undefined;
    /** Skip type checking .d.ts files that are included with TypeScript. */
    skipDefaultLibCheck?: boolean | undefined;
    /** Skip type checking all .d.ts files. */
    skipLibCheck?: boolean | undefined;
    /** Specify a file that bundles all outputs into one JavaScript file. If `declaration` is true, also designates a file that bundles all .d.ts output. */
    outFile?: string | undefined;
    /** Specify an output folder for all emitted files. */
    outDir?: string | undefined;
    /** Disable erasing `const enum` declarations in generated code. */
    preserveConstEnums?: boolean | undefined;
    /** Disable resolving symlinks to their realpath. This correlates to the same flag in node. */
    preserveSymlinks?: boolean | undefined;
    /** Preserve unused imported values in the JavaScript output that would otherwise be removed */
    preserveValueImports?: boolean | undefined;
    /** Disable wiping the console in watch mode */
    preserveWatchOutput?: boolean | undefined;
    /** Enable color and formatting in output to make compiler errors easier to read */
    pretty?: boolean | undefined;
    /** Disable emitting comments. */
    removeComments?: boolean | undefined;
    /** Specify the root folder within your source files. */
    rootDir?: string | undefined;
    /** Ensure that each file can be safely transpiled without relying on other imports. */
    isolatedModules?: boolean | undefined;
    /** Create source map files for emitted JavaScript files. */
    sourceMap?: boolean | undefined;
    /** Specify the root path for debuggers to find the reference source code. */
    sourceRoot?: string | undefined;
    /** Disable reporting of excess property errors during the creation of object literals. */
    suppressExcessPropertyErrors?: boolean | undefined;
    /** Suppress `noImplicitAny` errors when indexing objects that lack index signatures. */
    suppressImplicitAnyIndexErrors?: boolean | undefined;
    /** Disable emitting declarations that have `@internal` in their JSDoc comments. */
    stripInternal?: boolean | undefined;
    /** Set the JavaScript language version for emitted JavaScript and include compatible library declarations. */
    target?: string | undefined;
    /** Default catch clause variables as `unknown` instead of `any`. */
    useUnknownInCatchVariables?: boolean | undefined;
    /** Watch input files. */
    watch?: boolean | undefined;
    /** Specify the polling strategy to use when the system runs out of or doesn't support native file watchers. Requires TypeScript version 3.8 or later. */
    fallbackPolling?: string | undefined;
    /** Specify the strategy for watching directories under systems that lack recursive file-watching functionality. Requires TypeScript version 3.8 or later. */
    watchDirectory?: string | undefined;
    /** Specify the strategy for watching individual files. Requires TypeScript version 3.8 or later. */
    watchFile?: string | undefined;
    /** Enable experimental support for TC39 stage 2 draft decorators. */
    experimentalDecorators?: boolean | undefined;
    /** Emit design-type metadata for decorated declarations in source files. */
    emitDecoratorMetadata?: boolean | undefined;
    /** Disable error reporting for unused labels. */
    allowUnusedLabels?: boolean | undefined;
    /** Enable error reporting for codepaths that do not explicitly return in a function. */
    noImplicitReturns?: boolean | undefined;
    /** Add `undefined` to a type when accessed using an index. */
    noUncheckedIndexedAccess?: boolean | undefined;
    /** Enable error reporting for fallthrough cases in switch statements. */
    noFallthroughCasesInSwitch?: boolean | undefined;
    /** Ensure overriding members in derived classes are marked with an override modifier. */
    noImplicitOverride?: boolean | undefined;
    /** Disable error reporting for unreachable code. */
    allowUnreachableCode?: boolean | undefined;
    /** Ensure that casing is correct in imports. */
    forceConsistentCasingInFileNames?: boolean | undefined;
    /** Emit a v8 CPU profile of the compiler run for debugging. */
    generateCpuProfile?: string | undefined;
    /** Specify the base directory to resolve non-relative module names. */
    baseUrl?: string | undefined;
    /** Specify a set of entries that re-map imports to additional lookup locations. */
    paths?: { [k: string]: string[] | undefined } | undefined;
    /** Specify a list of language service plugins to include. */
    plugins?: { name: string; [k: string]: unknown | undefined }[] | undefined;
    /** Allow multiple folders to be treated as one when resolving modules. */
    rootDirs?: string[] | undefined;
    /** Specify multiple folders that act like `./node_modules/@types`. */
    typeRoots?: string[] | undefined;
    /** Specify type package names to be included without being referenced in a source file. */
    types?: string[] | undefined;
    /** Enable tracing of the name resolution process. Requires TypeScript version 2.0 or later. */
    traceResolution?: boolean | undefined;
    /** Allow JavaScript files to be a part of your program. Use the `checkJS` option to get errors from these files. */
    allowJs?: boolean | undefined;
    /** Disable truncating types in error messages. */
    noErrorTruncation?: boolean | undefined;
    /** Allow 'import x from y' when a module doesn't have a default export. */
    allowSyntheticDefaultImports?: boolean | undefined;
    /** Disable adding 'use strict' directives in emitted JavaScript files. */
    noImplicitUseStrict?: boolean | undefined;
    /** Print the names of emitted files after a compilation. */
    listEmittedFiles?: boolean | undefined;
    /** Remove the 20mb cap on total source code size for JavaScript files in the TypeScript language server. */
    disableSizeLimit?: boolean | undefined;
    /** Specify a set of bundled library declaration files that describe the target runtime environment. */
    lib?: string[] | undefined;
    /** When type checking, take into account `null` and `undefined`. */
    strictNullChecks?: boolean | undefined;
    /** Specify the maximum folder depth used for checking JavaScript files from `node_modules`. Only applicable with `allowJs`. */
    maxNodeModuleJsDepth?: number | undefined;
    /** Allow importing helper functions from tslib once per project, instead of including them per-file. */
    importHelpers?: boolean | undefined;
    /** Specify emit/checking behavior for imports that are only used for types. */
    importsNotUsedAsValues?: string | undefined;
    /** Ensure 'use strict' is always emitted. */
    alwaysStrict?: boolean | undefined;
    /** Enable all strict type checking options. */
    strict?: boolean | undefined;
    /** Check that the arguments for `bind`, `call`, and `apply` methods match the original function. */
    strictBindCallApply?: boolean | undefined;
    /** Emit more compliant, but verbose and less performant JavaScript for iteration. */
    downlevelIteration?: boolean | undefined;
    /** Enable error reporting in type-checked JavaScript files. */
    checkJs?: boolean | undefined;
    /** When assigning functions, check to ensure parameters and the return values are subtype-compatible. */
    strictFunctionTypes?: boolean | undefined;
    /** Check for class properties that are declared but not set in the constructor. */
    strictPropertyInitialization?: boolean | undefined;
    /** Emit additional JavaScript to ease support for importing CommonJS modules. This enables `allowSyntheticDefaultImports` for type compatibility. */
    esModuleInterop?: boolean | undefined;
    /** Allow accessing UMD globals from modules. */
    allowUmdGlobalAccess?: boolean | undefined;
    /** Make keyof only return strings instead of string, numbers or symbols. Legacy option. */
    keyofStringsOnly?: boolean | undefined;
    /** Emit ECMAScript-standard-compliant class fields. */
    useDefineForClassFields?: boolean | undefined;
    /** Create sourcemaps for d.ts files. */
    declarationMap?: boolean | undefined;
    /** Enable importing .json files */
    resolveJsonModule?: boolean | undefined;
    /** Have recompiles in '--incremental' and '--watch' assume that changes within a file will only affect files directly depending on it. Requires TypeScript version 3.8 or later. */
    assumeChangesOnlyAffectDirectDependencies?: boolean | undefined;
    /** Output more detailed compiler performance information after building. */
    extendedDiagnostics?: boolean | undefined;
    /** Print names of files that are part of the compilation and then stop processing. */
    listFilesOnly?: boolean | undefined;
    /** Disable preferring source files instead of declaration files when referencing composite projects */
    disableSourceOfProjectReferenceRedirect?: boolean | undefined;
    /** Opt a project out of multi-project reference checking when editing. */
    disableSolutionSearching?: boolean | undefined;

    [k: string]: unknown | undefined;
  }

  /** Settings for the watch mode in TypeScript. */
  export interface WatchOptions {
    force?: string | undefined;
    /** Specify how the TypeScript watch mode works. */
    watchFile?: string | undefined;
    /** Specify how directories are watched on systems that lack recursive file-watching functionality. */
    watchDirectory?: string | undefined;
    /** Specify what approach the watcher should use if the system runs out of native file watchers. */
    fallbackPolling?: string | undefined;
    /** Synchronously call callbacks and update the state of directory watchers on platforms that don`t support recursive watching natively. */
    synchronousWatchDirectory?: boolean | undefined;
    /** Remove a list of files from the watch mode's processing. */
    excludeFiles?: string[] | undefined;
    /** Remove a list of directories from the watch process. */
    excludeDirectories?: string[] | undefined;

    [k: string]: unknown;
  }

  export interface BuildOptions {
    dry?: boolean | undefined;
    /** Build all projects, including those that appear to be up to date */
    force?: boolean | undefined;
    /** Enable verbose logging */
    verbose?: boolean | undefined;
    /** Save .tsbuildinfo files to allow for incremental compilation of projects. */
    incremental?: boolean | undefined;
    /** Have recompiles in projects that use `incremental` and `watch` mode assume that changes within a file will only affect files directly depending on it. */
    assumeChangesOnlyAffectDirectDependencies?: boolean | undefined;
    /** Log paths used during the `moduleResolution` process. */
    traceResolution?: boolean | undefined;

    [k: string]: unknown | undefined;
  }

  /**
   * ts-node options.  See also: https://typestrong.org/ts-node/docs/configuration
   * ts-node offers TypeScript execution and REPL for node.js, with source map support.
   */
  export interface TsNodeOptions {
    /** Specify a custom TypeScript compiler. */
    compiler?: string | undefined;
    /** Use TypeScript's compiler host API instead of the language service API. */
    compilerHost?: boolean | undefined;
    /** JSON object to merge with TypeScript `compilerOptions`. */
    compilerOptions?: CompilerOptions | undefined;
    /** Emit output files into `.ts-node` directory. */
    emit?: boolean | undefined;
    /** Load "files" and "include" from `tsconfig.json` on startup. Default is to override `tsconfig.json` "files" and "include" to only include the entrypoint script. */
    files?: boolean | undefined;
    /**
     * Paths which should not be compiled.
     * Each string in the array is converted to a regular expression via `new RegExp()` and tested against source paths prior to compilation.
     * Source paths are normalized to posix-style separators, relative to the directory containing `tsconfig.json` or to cwd if no `tsconfig.json` is loaded.
     * Default is to ignore all node_modules subdirectories.
     */
    ignore?: string[] | undefined;
    /** Ignore TypeScript warnings by diagnostic code. */
    ignoreDiagnostics?: (string | number)[] | undefined;
    /** Logs TypeScript errors to stderr instead of throwing exceptions. */
    logError?: boolean | undefined;
    /**
     * Override certain paths to be compiled and executed as CommonJS or ECMAScript modules.
     * When overridden, the tsconfig "module" and package.json "type" fields are overridden.
     * This is useful because TypeScript files cannot use the .cjs nor .mjs file extensions;
     * it achieves the same effect.
     *
     * Each key is a glob pattern following the same rules as tsconfig's "include" array.
     * When multiple patterns match the same file, the last pattern takes precedence.
     *
     * `cjs` overrides matches files to compile and execute as CommonJS.
     * `esm` overrides matches files to compile and execute as native ECMAScript modules.
     * `package` overrides either of the above to default behavior, which obeys package.json "type" and
     * tsconfig.json "module" options.
     */
    moduleTypes?: { [k: string]: unknown } | undefined;
    /**
     * Re-order file extensions so that TypeScript imports are preferred.
     * For example, when both `index.js` and `index.ts` exist, enabling this option causes `require('./index')` to resolve to `index.ts` instead of `index.js`
     */
    preferTsExts?: boolean | undefined;
    /** Use pretty diagnostic formatter. */
    pretty?: boolean | undefined;
    /**
     * Modules to require, like node's `--require` flag.
     * If specified in `tsconfig.json`, the modules will be resolved relative to the `tsconfig.json` file.
     * If specified programmatically, each input string should be pre-resolved to an absolute path for
     * best results.
     */
    require?: string[] | undefined;
    /** Scope compiler to files within `scopeDir`. */
    scope?: boolean | undefined;
    scopeDir?: string | undefined;
    /** Skip ignore check, so that compilation will be attempted for all files with matching extensions. */
    skipIgnore?: boolean | undefined;
    /** Use TypeScript's faster `transpileModule`. */
    transpileOnly?: boolean | undefined;
    /** Specify a custom transpiler for use with transpileOnly */
    transpiler?:
      | [string, { [k: string]: unknown | undefined }, ...(string | { [k: string]: unknown | undefined })[]]
      | string
      | undefined;

    [k: string]: unknown;
  }

  export function sanitize(tsconfig: TsconfigJson | null | undefined): TsconfigJson {
    if (typeof tsconfig !== "object" || tsconfig === null || Array.isArray(tsconfig)) {
      return {};
    }
    const result = { ...tsconfig };

    let compilerOptions = result.compilerOptions;
    if (compilerOptions !== undefined) {
      if (typeof compilerOptions === "object" && compilerOptions !== null && !Array.isArray(compilerOptions)) {
        compilerOptions = { ...compilerOptions };
        result.compilerOptions = compilerOptions;
      } else {
        compilerOptions = undefined;
        delete result.compilerOptions;
      }
    }

    if (compilerOptions) {
      const compilerOptionsStringProperties = [
        "charset",
        "declarationDir",
        "tsBuildInfoFile",
        "jsx",
        "reactNamespace",
        "jsxFactory",
        "jsxFragmentFactory",
        "jsxImportSource",
        "mapRoot",
        "module",
        "moduleResolution",
        "newLine",
        "importsNotUsedAsValues",
        "outFile",
        "outDir",
        "rootDir",
        "sourceRoot",
        "target",
        "fallbackPolling",
        "watchDirectory",
        "watchFile",
        "generateCpuProfile",
        "baseUrl",
      ];

      const compilerOptionsBooleanProperties = [
        "composite",
        "declaration",
        "diagnostics",
        "disableReferencedProjectLoad",
        "noPropertyAccessFromIndexSignature",
        "emitBOM",
        "emitDeclarationOnly",
        "exactOptionalPropertyTypes",
        "incremental",
        "inlineSourceMap",
        "inlineSources",
        "listFiles",
        "noEmit",
        "noEmitHelpers",
        "noEmitOnError",
        "noImplicitAny",
        "noImplicitThis",
        "noUnusedLocals",
        "noUnusedParameters",
        "noLib",
        "noResolve",
        "noStrictGenericChecks",
        "skipDefaultLibCheck",
        "skipLibCheck",
        "preserveConstEnums",
        "preserveSymlinks",
        "preserveValueImports",
        "preserveWatchOutput",
        "pretty",
        "removeComments",
        "isolatedModules",
        "sourceMap",
        "suppressExcessPropertyErrors",
        "suppressImplicitAnyIndexErrors",
        "stripInternal",
        "useUnknownInCatchVariables",
        "watch",
        "experimentalDecorators",
        "emitDecoratorMetadata",
        "allowUnusedLabels",
        "noImplicitReturns",
        "noUncheckedIndexedAccess",
        "noFallthroughCasesInSwitch",
        "noImplicitOverride",
        "allowUnreachableCode",
        "forceConsistentCasingInFileNames",
        "traceResolution",
        "allowJs",
        "noErrorTruncation",
        "noErrorTruncation",
        "noErrorTruncation",
        "allowSyntheticDefaultImports",
        "noImplicitUseStrict",
        "listEmittedFiles",
        "disableSizeLimit",
        "strictNullChecks",
        "importHelpers",
        "alwaysStrict",
        "strict",
        "strictBindCallApply",
        "downlevelIteration",
        "checkJs",
        "strictFunctionTypes",
        "strictPropertyInitialization",
        "esModuleInterop",
        "allowUmdGlobalAccess",
        "keyofStringsOnly",
        "useDefineForClassFields",
        "declarationMap",
        "resolveJsonModule",
        "assumeChangesOnlyAffectDirectDependencies",
        "extendedDiagnostics",
        "listFilesOnly",
        "disableSolutionSearching",
        "disableSourceOfProjectReferenceRedirect",
      ];

      const compilerOptionsStringArrayProperties = ["rootDirs", "typeRoots", "types", "lib"];

      for (const key of compilerOptionsStringProperties) {
        if (compilerOptions[key] !== undefined && typeof compilerOptions[key] !== "string") {
          delete compilerOptions[key];
        }
      }

      for (const key of compilerOptionsBooleanProperties) {
        if (compilerOptions[key] !== undefined && typeof compilerOptions[key] !== "boolean") {
          delete compilerOptions[key];
        }
      }

      for (const key of compilerOptionsStringArrayProperties) {
        const value = compilerOptions[key] as UnsafeAny;
        if (value !== undefined) {
          if (Array.isArray(value)) {
            compilerOptions[key] = value.filter((x: unknown) => typeof x === "string");
          } else {
            delete compilerOptions[key];
          }
        }
      }
    }

    if (result.references !== undefined) {
      if (Array.isArray(result.references)) {
        result.references = result.references.filter(
          (item) => typeof item === "object" && item !== null && typeof item.path === "string",
        );
      } else {
        delete result.references;
      }
    }

    for (const key of ["files", "exclude", "include"]) {
      const value = result[key] as UnsafeAny;
      if (value !== undefined) {
        if (Array.isArray(value)) {
          result[key] = value.filter((x: unknown) => typeof x === "string");
        } else {
          delete result[key];
        }
      }
    }

    if (result.compileOnSave !== undefined && typeof result.compileOnSave !== "boolean") {
      delete result.compileOnSave;
    }

    return result;
  }
}
