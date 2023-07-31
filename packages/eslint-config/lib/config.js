const { findFileInParents } = require("./utils");
const path = require("path");
const fs = require("fs");
const Module = require("module");
const parseGitignore = require("parse-gitignore");
const appRootPath = require("app-root-path");

const sourceNodeExtensions = [".ts", ".tsx", ".mts", ".cts", ".jsx", ".js", ".mjs", ".cjs"];

/** @type {string[]} */
let _ignorePatterns;

let _tsConfigPath;

module.exports = {
  sourceExtensions: [...sourceNodeExtensions, "._js", ".es", ".es6"],
  importableExtensions: [...sourceNodeExtensions, ".json", ".node"],
  dist: [
    "**/dist/**/*",
    "**/out/**/*",
    "**/_dist/**/*",
    "**/_out/**/*",
    "**/.dist/**/*",
    "**/.out/**/*",
    "**/wasm/**/*",
    "**/emscripten/**/*",
  ],
  scripts: [
    "*.config*",
    "**/dev-server/**/*",
    "**/scripts/**/*",
    "**/dev/**/*",
    "**/bin/**/*",
    "**/.bin/**/*",
    "**/build/**/*",
    ".eslintrc.js",
    "webpack.config.*",
    "webpack.*.config.*",
    "jest-*.*",
    "**/testUtils/**/*",
    "**/__mocks__/**/*",
    "Gruntfile.js",
    "gulpfile.js",
    "Gulpfile.js",
    "**/gulp/**/*",
    "**/grunt/**/*",
    "*-jest-*.*",
    "**/.mocharc.*",
  ],
  tests: [
    "*vitest*",
    "*.test.*",
    "*.spec.*",
    "**/test/**/*",
    "**/tests/**/*",
    "**/*-test/**/*",
    "**/*-tests/**/*",
    "**/__mocks__/**/*",
    "**/__specs__/**/*",
    "**/__tests__/**/*",
    "**/__mock__/**/*",
    "**/__spec__/**/*",
    "**/__test__/**/*",
    "**/testUtils/**/*",
    "*-jest-*.*",
    "**/.mocharc.*",
  ],
  getIgnorePatterns() {
    return _ignorePatterns || (_ignorePatterns = loadIgnorePatterns());
  },
  getTsConfigPath() {
    return (
      (_tsConfigPath !== undefined ? _tsConfigPath : (_tsConfigPath = findFileInParents("tsconfig.json"))) || undefined
    );
  },
  getHasChai,
  getHasMocha,
  getHasReact,
  getHasJest,
  getHasVitest,
};

function loadIgnorePatterns() {
  const processedDirs = new Set();
  const ignoreFiles = new Set();

  const loadGitIgnoreFiles = (dir) => {
    for (;;) {
      if (processedDirs.has(dir)) {
        break;
      }
      processedDirs.add(dir);
      const ignoreFile = path.join(dir, ".gitignore");
      if (fs.existsSync(ignoreFile)) {
        const gitIgnorePath = path.join(dir, ".gitignore");
        const prettierIgnorePath = path.join(dir, ".prettierignore");

        const hasGitignore = fs.existsSync(gitIgnorePath);
        const hasPrettierIgnore = fs.existsSync(prettierIgnorePath);

        if (
          (hasGitignore || hasPrettierIgnore) &&
          (fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, ".git")))
        ) {
          if (hasGitignore) {
            ignoreFiles.add(gitIgnorePath);
          }
          if (hasPrettierIgnore) {
            ignoreFiles.add(prettierIgnorePath);
          }
        }
      }
      dir = path.dirname(dir);
    }
  };

  loadGitIgnoreFiles(process.cwd());
  loadGitIgnoreFiles(appRootPath.path);

  let allIgnoreText = "dist\nnode_modules\nvendor\npackage-lock.json\nyarn.lock\npnpm-lock.*\n";
  for (const ignoreFile of Array.from(ignoreFiles).reverse()) {
    try {
      const content = fs.readFileSync(ignoreFile, "utf8").trim();
      if (content.length > 0) {
        allIgnoreText += `# ${ignoreFile}\n`;
        allIgnoreText += content;
        allIgnoreText += "\n\n";
      }
    } catch {}
  }

  return parseGitignore(allIgnoreText).patterns;
}

const _hasPackageCache = new Map();
let _packageResolver;

function _hasPackage(name) {
  let result = _hasPackageCache.get(name);
  if (result !== undefined) {
    return result;
  }
  result = false;
  if (!_packageResolver) {
    _packageResolver = Module.createRequire(path.resolve(process.cwd(), "index.js"));
  }
  try {
    _packageResolver.resolve(name);
    result = true;
  } catch {}
  try {
    require.resolve(name);
    result = true;
  } catch {}
  _hasPackageCache.set(name, result);
  return result;
}

function getHasChai() {
  return _hasPackage("chai") && _hasPackage("eslint-plugin-chai-expect");
}

function getHasMocha() {
  return _hasPackage("mocha") && _hasPackage("eslint-plugin-mocha");
}

function getHasVitest() {
  return _hasPackage("vitest") && _hasPackage("eslint-plugin-vitest");
}

function getHasReact() {
  return _hasPackage("react") && _hasPackage("eslint-plugin-react") && _hasPackage("eslint-plugin-react-hooks");
}

function getHasJest() {
  return _hasPackage("jest") && _hasPackage("eslint-plugin-jest");
}
