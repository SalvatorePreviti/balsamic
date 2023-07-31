const path = require("path");
const manifest = require("../../package.json");
const logging = require("./logging");
const fs = require("fs");
const chalk = require("chalk");
const {
  loadPackageJson,
  rewritePackageJson,
  copyProjectFile,
  createProjectFile,
  findDirectoryInParents,
  cleanupText,
  runAsync,
  getPackageManager,
} = require("./fs-utils");

module.exports = {
  initProject,
  initNpmIgnore,
  initClangFormat,
  initTsn,
  initEditorConfig,
  initLicense,
};

function initNpmIgnore() {
  logging.banner(".npmignore initialization");
  copyProjectFile(".npmignore.default", ".npmignore");
  logging.log();
}

function initLicense() {
  logging.banner("MIT license initialization");
  const author = manifest.author || "";
  const year = new Date().getFullYear();

  let content = fs.readFileSync(path.join(__dirname, "license-templates/mit-license-template.txt"), "utf8");

  content = content.replace(/<year>/g, year);

  if (author) {
    content = content.replace(/<author>/g, author);
  }

  createProjectFile("LICENSE", content);
}

function initEditorConfig() {
  logging.banner(".editorconfig initialization");
  copyProjectFile(".editorconfig", ".editorconfig");
  logging.log();
}

function initClangFormat() {
  logging.banner("clang-format initialization");
  copyProjectFile(".clang-format");
  logging.log();
}

function initTsn() {
  logging.banner("tsn initialization");
  copyProjectFile("tsn", "tsn");
  fs.chmodSync("tsn", 0o755);
  logging.log();
}

async function initProject() {
  logging.banner("project initialization");

  const gitDirectory = findDirectoryInParents(".git");
  if (!gitDirectory) {
    if (await logging.askConfirmation(`.git not found. Do you want to run ${chalk.yellow("git init")}?`)) {
      await runAsync("git", ["init"]);
    }
  }

  if (!fs.existsSync("package.json")) {
    logging.warn("package.json not found - creating a new project");
    logging.log();
    await runAsync("npm", "init");
  }

  const originalProject = loadPackageJson("package.json");

  const project = JSON.parse(JSON.stringify(originalProject));

  if (project.private === undefined) {
    project.private = !!(await logging.askConfirmation(
      `Is this a ${chalk.yellowBright("private")}${chalk.yellow(": ")}${chalk.greenBright("true")} package?`,
    ));
  }

  createProjectFiles();
  fixProjectFields(project);

  const hasGitHooks = initGitHooks(project, gitDirectory);

  addDependencies(project, { hasGitHooks });

  if (!fs.existsSync("tsn")) {
    initTsn();
  }

  await rewritePackageJson("package.json", project);

  logging.footer("Initialization completed.");

  logging.log(chalk.greenBright("IMPORTANT:"));

  if (getPackageManager() === "yarn") {
    logging.log(chalk.cyanBright(` run \`${chalk.yellowBright("yarn")}\` to install all packages.`));
  } else {
    logging.log(chalk.cyanBright(` run \`${chalk.yellowBright("npm i")}\` to install all packages.`));
  }

  if (hasGitHooks) {
    logging.log(chalk.cyanBright(` run \`${chalk.yellowBright("npx husky install")}\` to initialize git hooks.`));
  }

  logging.log("");
}

function createProjectFiles() {
  createProjectFile("tsconfig.json", cleanupText(JSON.stringify({ extends: "@balsamic/tsn/tsconfig.json" }, null, 2)));

  copyProjectFile(".gitignore.default", ".gitignore");
  copyProjectFile(".vscode/settings.json");
  copyProjectFile(".vscode/extensions.json");
}

function initGitHooks(project, gitDirectory) {
  if (!gitDirectory) {
    logging.skip("git hooks skipped, not a git repo");
    return false;
  }

  const huskyPath = path.join(path.relative(path.dirname(gitDirectory), process.cwd()), ".husky").replace(/\\/g, "/");
  if (huskyPath !== ".husky") {
    logging.skip("git hooks skipped, cannot be installed in the parent folder");
  }

  createProjectFile(path.posix.join(huskyPath, "pre-commit"), "npm run precommit\n");
  try {
    fs.chmodSync(path.join(huskyPath, "pre-commit"), "755");
  } catch (_) {
    // Ignore error
  }

  createProjectFile(path.join(huskyPath, ".gitignore"), "_\n");
  const scripts = project.scripts || (project.scripts = {});

  const precommitScript = "lint-staged";

  if (!project["int-staged"]) {
    project["lint-staged"] = {
      "*.{js,jsx,ts,tsx,mts,cts,cjs,mjs,json}": [
        "eslint --no-error-on-unmatched-pattern --fix",
        "prettier --write --log-level=warn",
      ],
      "*.{yml,yaml,md,htm,html,css,scss,less}": ["prettier --write --log-level=warn"],
    };
  }

  if (!scripts.precommit) {
    logging.progress("adding precommit script ...");
    scripts.precommit = precommitScript;
  } else if (scripts.precommit !== precommitScript) {
    logging.skip("precommit script already present, skipping", precommitScript);
  } else {
    logging.skip("precommit script already present");
  }

  return true;
}

function fixProjectFields(project) {
  if (!project.name) {
    project.name = path.dirname(process.cwd());
    logging.progress(`project name is now ${project.name}`);
  }
  project.engines = {
    node: ">=18.17.0",
    ...project.engines,
  };
  if (!project.license) {
    project.license = "ISC";
    logging.progress(`project license is now ${project.license}`);
  }
  if (!project.keywords) {
    project.keywords = [project.name];
    logging.progress("added project keywords", project.keywords);
  }
  if (!project.prettier) {
    project.prettier = "@balsamic/eslint-config/.prettierrc";
    logging.progress(`added prettier config ${project.prettier}`);
  }
  if (!project.eslintConfig) {
    project.eslintConfig = {
      $schema: "http://json.schemastore.org/prettierrc",
      extends: "@balsamic",
    };
    logging.progress(`added eslint config ${project.eslintConfig}`);
  }
}

function sortObjectKeys(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return obj;
  }
  const result = {};
  for (const [k, v] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
    result[k] = v;
  }
  return result;
}

function addDependencies(project, { hasGitHooks }) {
  const dependenciesAdded = new Set();
  const dependenciesUpdated = new Set();
  const existingDeps = getAllProjectDependencies(project);

  const extraDependencies = getAllProjectDependencies(require("./extra-packages/package.json"));
  extraDependencies[manifest.name] = `^${manifest.version}`;
  for (const [k, v] of Object.entries(manifest.peerDependencies)) {
    if (!extraDependencies[k]) {
      extraDependencies[k] = v;
    }
  }

  const devDependencies = sortObjectKeys(project.devDependencies) || {};
  const dependencies = sortObjectKeys(project.dependencies) || {};

  const addDevDependency = (key, value) => {
    if (typeof value !== "string" || !value.length) {
      return false;
    }
    value = value.replace(">=", "^");
    if (!existingDeps[key] && !devDependencies[key]) {
      dependenciesAdded.add(key);
    } else if (isSemverBetter(existingDeps[key], value)) {
      dependenciesUpdated.add(key);
    } else {
      return false;
    }
    if (devDependencies[key] && dependencies[key]) {
      delete devDependencies[key];
    }
    if (dependencies[key]) {
      dependencies[key] = value;
    } else {
      devDependencies[key] = value;
    }
    return true;
  };

  addDevDependency(manifest.name, `^${manifest.version}`);

  for (const [key, value] of Object.entries(sortObjectKeys(manifest.peerDependencies))) {
    addDevDependency(key, value);
  }

  for (const key of Object.keys(dependencies)) {
    addDevDependency(key, extraDependencies[key]);
  }

  for (const key of Object.keys(devDependencies)) {
    addDevDependency(key, extraDependencies[key]);
  }

  for (const [key, value] of Object.entries(sortObjectKeys(manifest.peerDependencies))) {
    addDevDependency(key, value);
  }

  if (hasGitHooks) {
    addDevDependency("husky", extraDependencies.husky);
    addDevDependency("lint-staged", extraDependencies["lint-staged"]);
  }

  if (existingDeps.react) {
    addDevDependency("eslint-plugin-react", extraDependencies["eslint-plugin-react"]);
    addDevDependency("eslint-plugin-react-hooks", extraDependencies["eslint-plugin-react-hooks"]);
  }

  let hasChai = !!existingDeps.chai;

  if (existingDeps.mocha) {
    addDevDependency("eslint-plugin-mocha", extraDependencies["eslint-plugin-mocha"]);
    addDevDependency("@types/mocha", extraDependencies["@types/mocha"]);
    addDevDependency("mocha", extraDependencies.mocha);
    addDevDependency("chai", extraDependencies.chai);
    hasChai = true;
  }

  if (existingDeps.vitest) {
    addDevDependency("eslint-plugin-vitest", extraDependencies["eslint-plugin-vitest"]);
    hasChai = true;
  }

  if (hasChai) {
    addDevDependency("eslint-plugin-chai-expect", extraDependencies["eslint-plugin-chai-expect"]);
    addDevDependency("@types/chai", extraDependencies["@types/chai"]);
    addDevDependency("chai", extraDependencies.chai);
  }

  if (Object.keys(devDependencies).length) {
    if (JSON.stringify(project.devDependencies || null) !== JSON.stringify(devDependencies)) {
      project.devDependencies = sortObjectKeys(devDependencies);
    }
  } else {
    delete project.devDependencies;
  }

  if (Object.keys(dependencies).length) {
    if (JSON.stringify(project.dependencies || null) !== JSON.stringify(dependencies)) {
      project.dependencies = sortObjectKeys(dependencies);
    }
  } else {
    delete project.dependencies;
  }

  const loggingArgs = [];
  if (dependenciesAdded.length) {
    dependenciesAdded.push("added dependencies:", Array.from(dependenciesAdded));
  }
  if (dependenciesUpdated.length) {
    loggingArgs.push("updated dependencies:", Array.from(dependenciesUpdated));
  }
  if (loggingArgs.length) {
    logging.progress(...loggingArgs);
  } else {
    logging.skip("no dependencies to add");
  }
}

function getAllProjectDependencies(project) {
  const result = {};
  for (const mkey of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const arg = project[mkey];
    if (typeof arg === "object" && arg !== null && !Array.isArray(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (!(key in result)) {
          result[key] = value;
        }
      }
    }
  }
  return result;
}

function isSemverBetter(a, b) {
  a = typeof a === "string" ? a : "";
  b = typeof b === "string" ? b : "";
  if (a.includes(":") || b.includes(":")) {
    return false;
  }
  a = (typeof a === "string" && a.replace(/[^0-9*.]/g, "")) || "";
  b = (typeof b === "string" && b.replace(/[^0-9*.]/g, "")) || "";
  const pa = a.split(".");
  const pb = b.split(".");
  if (pa.length !== 3 || pb.length !== 3) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    const na = Number.parseInt(pa[i]);
    const nb = Number.parseInt(pb[i]);
    if (isNaN(na) || isNaN(nb)) {
      return false;
    }
    if (na > nb) {
      return false;
    }
    if (nb > na) {
      return true;
    }
  }
  return false;
}
