/* eslint-disable no-console */
const spawn = require("child_process").spawn;
const fs = require("fs");
const path = require("path");
const { tsn } = require("./index.js");

let _configPromise;

/**
 * @typedef {Object} Subtree
 * @property {string} name
 * @property {string} path
 * @property {string} localFolder
 * @property {string} branch
 * @property {string} push_branch
 * @property {string} repository
 * @property {string} root
 */

class Config {
  projectName = "";

  root = "";

  hasDotGit = false;

  /** @type {Record<string, Subtree}} */
  config = {};

  /** @type {string[]} */
  names = [];

  /**
   * @param {string} root
   * @param {Record<string, Partial<Subtree>} config
   * @param {boolean} hasDotGit
   */
  constructor(root, config, hasDotGit) {
    this.root = root;
    this.hasDotGit = hasDotGit;
    for (const [k, v] of Object.entries(config)) {
      if (k && typeof v === "object" && v !== null && v.repository && !k.startsWith(".") && !k.includes(" ")) {
        const localFolder = v.path || v.localFolder || k;
        const branch = v.branch || "main";
        const subtree = {
          name: k,
          root,
          path: path.resolve(root, localFolder),
          localFolder,
          branch,
          push_branch: (typeof config.defaultBranch === "string" && config.defaultBranch) || branch,
          repository: v.repository,
        };
        Object.defineProperty(subtree, "toString", {
          value() {
            return this.name;
          },
          enumerable: false,
        });
        this.config[k] = subtree;
        this.names.push(k);
      }
    }
  }

  /**
   * @param {string | Subtree} name
   * @returns {Subtree}
   */
  get(name) {
    if (typeof name === "object" && name !== null) {
      for (const v of Object.values(this.config)) {
        if (name === v) {
          return v;
        }
      }
      throw errorWithoutStack("Invalid subtree");
    }
    if (typeof name !== "string") {
      throw errorWithoutStack("Invalid subtree");
    }
    const subtree = this.config[name];
    if (typeof subtree !== "object" || subtree === null) {
      if (name) {
        for (const v of Object.values(this.config)) {
          if (v.repository === name || v.path === name || v.path === path.resolve(name) || v.localFolder === name) {
            return v;
          }
        }
      }
      throw errorWithoutStack(`Unknown subtree ${name}`);
    }
    return subtree;
  }

  getMany(arg, defaultToAll) {
    if (Array.isArray(arg) && arg.length === 1) {
      arg = arg[0];
    }
    if (arg === "*") {
      arg = "";
    }
    if (!arg) {
      arg = defaultToAll ? this.names.slice() : ".";
    } else {
      if (typeof arg === "string") {
        arg = arg.trim();
      }
      if (arg === "." || arg === "./") {
        arg = process.cwd();
      }
      arg = Array.isArray(arg) ? arg : arg.split(" ") || [arg];
    }
    return arg.map((name) => this.get(name));
  }

  /**
   * @returns {Promise<Config>}
   */
  static async load() {
    if (!_configPromise) {
      _configPromise = (async () => {
        let root = null;
        let currentDir = process.cwd();
        let config = null;
        let hasDotGit = false;

        while (config === null) {
          let packageJsonContent = null;
          try {
            packageJsonContent = JSON.parse(await fs.promises.readFile(path.join(currentDir, "package.json"), "utf-8"));
            const cfg = packageJsonContent && (packageJsonContent["git-subtree"] || packageJsonContent["git-subtrees"]);
            if (typeof cfg === "object" && cfg !== null && !Array.isArray(cfg)) {
              config = cfg;
              root = currentDir;
              if (!config.defaultBranch) {
                config.defaultBranch =
                  typeof packageJsonContent.name === "string" && config.defaultBranch
                    ? config.defaultBranch
                    : typeof packageJsonContent.name === "string"
                    ? packageJsonContent.name.replace("@", "").replace("/", "-")
                    : "";
              }
            }
          } catch (error) {
            // ignore
          }
          try {
            if ((await fs.promises.stat(path.join(currentDir, ".git"))).isDirectory()) {
              hasDotGit = true;
              break; // .git directory found, bail out
            }
          } catch (error) {
            // ignore
          }

          const parent = path.join(currentDir, "..");
          if (currentDir === parent) {
            break;
          }
          currentDir = parent;
        }
        if (!config) {
          throw errorWithoutStack('No valid "git-subtrees" configuration found in workspace package.json');
        }
        return new Config(root, config, hasDotGit);
      })();
    }
    return _configPromise;
  }
}

function errorWithoutStack(err, shouldPrintHelp) {
  if (!(err instanceof Error)) {
    err = new Error(err);
    Error.captureStackTrace(err, errorWithoutStack);
  }
  err.showStack = false;
  if (shouldPrintHelp) {
    err.printHelp = true;
  }
  return err;
}

function printHelp() {
  console.log();
  console.log("Usage: tsn git-subtree <command> [args]");
  console.log();
  console.log("Configuration is read from package.json, under the key `git-subtrees`");
  console.log(
    '    "git-subtree": { <name> { localFolder: [relative path], "repository": "https://...", "branch": [branch name], "push_branch": [branch name] } ... }',
  );
  console.log();
  console.log("Commands:");
  console.log("  init [subtree1] [subtree2] ...   Initialize subtrees");
  console.log("  pull [subtree1] [subtree2] ...   Pull subtrees");
  console.log('  commit <subtree> "<message>"     Commit subtree');
  console.log("  push <subtree> [branch]          Push subtree");
  console.log("  print-config                     Print configuration");
  console.log("  list                             List the configured subtrees");
  console.log();
}

const run = async (args) => {
  if (args.length < 1) {
    throw errorWithoutStack("Command not specified", true);
  }

  const command = args[0];
  args = args.slice(1);

  if (args.includes("--help")) {
    if (!process.exitCode) {
      process.exitCode = 1;
    }
    return;
  }

  switch (command) {
    case "list":
      console.log((await Config.load()).names.join("\n"));
      break;

    case "print-config":
      console.log(JSON.stringify((await Config.load()).config, null, 2));
      break;

    case "init":
      await cmd_init(args.length > 0 ? args : "");
      break;

    case "pull":
      await cmd_pull(args.length > 0 ? args : "");
      break;

    case "commit":
      if (args.length < 2) {
        throw errorWithoutStack('Use `tsn git-subtree commit <subtree> "<message>"`', true);
      }
      await cmd_commit(args[0], args.slice(1).join(" "));
      break;

    case "push":
      if (args.length < 1) {
        throw errorWithoutStack("Use `tsn git-subtree push <subtree> [branch]`", true);
      }
      await cmd_push(args[0], args[1]);
      break;

    default:
      throw errorWithoutStack(`Unknown command git-subtree ${command}`, true);
  }
};

async function checkChangesPending() {
  const config = await Config.load();

  await checkHasHead();

  const result = await execute("git", ["status", "--porcelain", "--untracked=no"], config.root);
  if (result.output.trim()) {
    throw errorWithoutStack(`Working tree has modifications. Sort them out first!\n${result.output}`);
  }
}

async function checkHasHead() {
  const config = await Config.load();

  if (!config.hasDotGit) {
    throw errorWithoutStack("No .git directory found, are you in a git repository? Try git init");
  }

  try {
    await execute("git", ["rev-parse", "--verify", "HEAD"], config.root);
  } catch {
    throw errorWithoutStack("You need to create at least a first commit");
  }
}

async function getRemotesSet() {
  const config = await Config.load();

  const roots = new Set();
  for (const subtree of Object.values(config.config)) {
    roots.add(subtree.root);
  }

  const remotes = new Set();

  const promises = [];
  for (const root of roots) {
    promises.push(execute("git", ["remote"], root, false));
  }
  const results = await Promise.all(promises);

  for (const result of results) {
    for (const remote of result.stdout.split("\n")) {
      if (remote) {
        remotes.add(remote);
      }
    }
  }

  return remotes;
}

async function cmd_init(subtreeNames) {
  await checkChangesPending();

  const subtrees = (await Config.load()).getMany(subtreeNames, true);

  if (subtrees.length === 0) {
    throw errorWithoutStack("No subtrees to initialize", true);
  }

  for (const subtree of subtrees) {
    const remoteExists = (await getRemotesSet()).has(subtree.name);
    if (remoteExists) {
      console.log(tsn.colors.yellow(`Remote "${subtree.name}" already exists.`));
    } else {
      await execute("git", ["remote", "add", "-f", subtree.localFolder, subtree.repository], subtree.root);
    }

    const localFolderExists = fs.existsSync(subtree.path);
    if (!localFolderExists) {
      await execute("git", ["fetch", subtree.name], subtree.root, true);
      await execute(
        "git",
        ["subtree", "add", `--prefix=${subtree.localFolder}`, subtree.name, subtree.branch, "--squash"],
        subtree.root,
        true,
      );
    }
  }
}

async function cmd_push(subtreeName, branch) {
  await checkChangesPending();

  const subtree = (await Config.load()).get(subtreeName);

  console.log(tsn.colors.yellowBright(`\n* subtree push: ${subtree.name}\n`));

  await execute(
    "git",
    ["subtree", "split", "--rejoin", `--prefix=${subtree.localFolder}`, "--squash"],
    subtree.root,
    true,
  );

  await execute(
    "git",
    [
      "subtree",
      "push",
      `--prefix=${subtree.localFolder}`,
      subtree.name,
      branch || subtree.push_branch || subtree.branch,
    ],
    subtree.root,
    true,
  );
}

async function cmd_commit(subtreeName, message) {
  if (!message) {
    throw errorWithoutStack("Commit message not specified", true);
  }
  const subtree = (await Config.load()).get(subtreeName);

  console.log(tsn.colors.yellowBright(`\n* subtree commit: ${subtree.name}\n`));

  await execute("git", ["commit", subtree.localFolder, "-m", message], subtree.root, true);
}

async function cmd_pull(subtreeNames) {
  const subtrees = (await Config.load()).getMany(subtreeNames, true);

  if (!subtrees.length) {
    throw errorWithoutStack("No subtrees to pull");
  }

  console.log(tsn.colors.yellowBright(`\n* subtree pull: ${subtrees.map((s) => s.name).join(", ")}\n`));

  await checkChangesPending();

  for (const subtree of subtrees) {
    await execute(
      "git",
      ["subtree", "pull", `--prefix=${subtree.localFolder}`, subtree.name, subtree.branch, "--squash"],
      subtree.root,
      true,
    );
  }
}

function execute(command, args, cwd = process.cwd(), printData = false) {
  args = args.filter((arg) => arg !== undefined && arg !== false && arg !== null);
  return new Promise((resolve, reject) => {
    console.log(tsn.colors.green(`${command} ${args.join(" ")}`));

    if (process.platform === "win32" && process.env.comspec) {
      command = process.env.comspec;
      args = ["/c", command, ...args];
    }

    let output = "";
    let stdout = "";
    let stderr = "";

    const childProcess = spawn(command, args, { cwd });

    const handleError = (e, code) => {
      if (!(e instanceof Error)) {
        if (typeof e === "number") {
          e = new Error(`${command} process exited with code ${e}`);
        } else {
          e = new Error(`${command} process failed`);
          e.cause = code;
        }
        e.showStack = false;
      }
      return reject(e);
    };

    childProcess.on("error", handleError);

    childProcess.stdout.on("data", (data) => {
      const dataStr = data.toString();
      stdout += dataStr;
      output += dataStr;

      if (printData) {
        process.stderr.write(data);
      }
    });

    childProcess.stderr.on("data", (data) => {
      const dataStr = data.toString();
      stderr += dataStr;
      output += dataStr;

      if (printData) {
        process.stdout.write(data);
      }
    });

    childProcess.on("close", (code) => {
      if (code !== 0) {
        handleError(code);
      } else {
        resolve({ output, stdout, stderr });
      }
    });
  });
}

module.exports = {
  Config,
  run,
  cmd_commit,
  cmd_init,
  cmd_pull,
  cmd_push,
};

if (require.main === module) {
  run(process.argv.slice(2))
    .then(() => {
      console.log();
    })
    .catch((e) => {
      if (!process.exitCode) {
        process.exitCode = 1;
      }
      if (e && e.printHelp) {
        printHelp();
      }
      console.log();
      if (e && e.showStack === false) {
        console.error(tsn.colors.redBright(`❌ ERROR: ${e.message}`));
      } else {
        console.error(tsn.colors.redBright(`❌ ERROR:`), e);
      }
      console.log();
    });
}
