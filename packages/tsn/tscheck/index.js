/* eslint-disable no-console */
/* eslint-disable global-require */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Worker } = require("node:worker_threads");

const { tsn } = require("../index.js");

exports.loadProject = loadProject;

exports.loadProjects = loadProjects;

exports.typecheckProjects = typecheckProjects;

let _ts;

async function loadProject(tsconfigFile) {
  const ts = _ts || (_ts = require("typescript"));

  const configFileName = tsconfigFile;
  const configFileText = await fs.promises.readFile(configFileName, "utf8");
  const result = ts.parseConfigFileTextToJson(configFileName, configFileText);
  const configObject = result.config;
  const configParseResult = ts.parseJsonConfigFileContent(configObject, ts.sys, path.dirname(configFileName));
  configParseResult.options.noEmit = true;
  configParseResult.options.incremental = false;
  configParseResult.options.tsBuildInfoFile = undefined;
  return configParseResult;
}

async function loadProjects(input = tsn.appRootPath) {
  const projectsStack = [];

  const projects = [];

  const projectsMap = new Map();

  const exploredDirectories = new Set();

  const filesMap = new Map();

  const exploreDir = async (dir) => {
    if (exploredDirectories.has(dir)) {
      return;
    }
    exploredDirectories.add(dir);

    const dirBasename = path.basename(dir).toLowerCase();
    if (/^node_modules$/i.test(dirBasename) || dirBasename.startsWith(".")) {
      return; // ignored directory
    }

    const items = await fs.promises.readdir(dir, { withFileTypes: true });

    const tsconfigEntry = items.find((item) => item.isFile() && item.name === "tsconfig.json");

    let project = projectsStack[projectsStack.length - 1] || null;

    if (tsconfigEntry) {
      const tsconfigPath = path.resolve(dir, tsconfigEntry.name);

      if (projectsMap.has(tsconfigPath)) {
        return; // Already processed
      }

      // Load the tsconfig
      const tsconfig = await loadProject(tsconfigPath);

      project = {
        parent: project,
        tsconfigPath,
        tsconfig,
        files: new Set(),
      };

      // push in the stack
      projectsStack.push(project);
      projects.push(project);
      projectsMap.set(tsconfigPath, project);
    }

    // Recurse subdirectories
    const promises = [];
    for (const item of items) {
      if (item.isDirectory()) {
        promises.push(exploreDir(path.resolve(dir, item.name)));
      }
    }
    if (promises.length) {
      await Promise.all(promises);
    }

    if (tsconfigEntry && project) {
      for (let file of project.tsconfig.fileNames) {
        file = path.resolve(dir, file);

        if (!filesMap.has(file) && !file.includes("node_modules")) {
          filesMap.set(file, project);
          project.files.add(file);
        }
      }

      projectsStack.pop();
    }
  };

  if (!Array.isArray(input)) {
    input = [input];
  }

  for (const folder of input) {
    if (typeof folder === "object" && folder !== null) {
      if (!projectsMap.has(folder.tsconfigPath)) {
        projectsMap.set(folder.tsconfigPath, folder);
        projects.push(folder);
      }
    }
  }

  const explorePromises = [];
  for (let folder of input) {
    if (typeof folder === "string") {
      if (path.basename(folder) === "tsconfig.json") {
        folder = path.dirname(folder);
      }
      explorePromises.push(exploreDir(folder));
    } else if (typeof folder === "object" && folder !== null) {
      projects.push(folder);
    }
  }

  if (explorePromises.length > 0) {
    await Promise.all(explorePromises);
  }

  return {
    totalFiles: filesMap.size,
    projects,
  };
}

async function typecheckProjects(input = tsn.appRootPath) {
  const projects = await loadProjects(input);

  let errors = 0;
  let warnings = 0;

  const workerPath = require.resolve("./_typecheck-worker.js");

  const typecheckProject = (projectInput) => {
    return new Promise((resolve, reject) => {
      let messageReceived = 100;
      const awaitMessage = () => {
        if (messageReceived > 0) {
          --messageReceived;
          setTimeout(awaitMessage, 15);
        }
        if (messageReceived === 0) {
          reject(new Error("No message received from worker"));
        } else {
          resolve();
        }
      };

      const worker = new Worker(workerPath, { workerData: projectInput });
      worker.on("error", (error) => {
        messageReceived = -1;
        reject(error);
      });
      worker.on("exit", (code) => {
        if (code !== 0) {
          messageReceived = -1;
          reject(new Error(`Worker stopped with exit code ${code}`));
        } else {
          awaitMessage();
        }
      });
      worker.on("message", (message) => {
        messageReceived = -1;
        errors += message.errors | 0;
        warnings += message.warnings | 0;
      });
    });
  };

  const chunksCount = Math.max(1, os.cpus().length);

  // Split the projects in chunks
  const chunks = [];
  for (let i = 0; i < chunksCount; ++i) {
    chunks.push([]);
  }
  for (let i = 0; i < projects.projects.length; ++i) {
    chunks[i % chunksCount].push(projects.projects[i]);
  }

  console.log(
    tsn.colors.rgb(120, 190, 255)(`⬢  tscheck ${projects.totalFiles} files in ${projects.projects.length} projects`),
  );

  const inputs = [];
  for (const chunk of chunks) {
    if (chunk.length > 0) {
      inputs.push({
        appRootPath: tsn.appRootPath,
        projects: chunk.map((project) => {
          return {
            tsconfigPath: project.tsconfigPath,
            options: project.tsconfig.options,
            files: Array.from(project.files),
          };
        }),
      });
    }
  }

  // Run the typecheck in parallel
  const promises = [];

  for (const projectInput of inputs) {
    promises.push(typecheckProject(projectInput));
  }

  await Promise.all(promises);

  if (errors || warnings) {
    const error = new Error(`Typecheck failed, ${errors} errors, ${warnings} warnings`);
    error.showStack = false;
    throw error;
  }
}

function tscheckMain(cb) {
  console.log();
  const title = tsn.colors.greenBright(`✅ tscheck ${tsn.colors.bold("OK")}`);

  console.time(title);

  const args = process.argv.slice(2);

  if (!tsn.hasProcessTitle) {
    tsn.processTitle = "tscheck";
  }

  typecheckProjects(args.length > 0 ? args : undefined)
    .then(() => {
      console.log();
      console.timeEnd(title);
      console.log();
      if (cb) {
        cb(null);
      }
    })
    .catch((e) => {
      if (!process.exitCode) {
        process.exitCode = 1;
      }

      console.log();
      if (e && e.showStack === false) {
        console.error(tsn.colors.redBright(`❌ ERROR: ${e.message}`));
      } else {
        console.error(tsn.colors.redBright(`❌ ERROR:`), e);
      }
      if (cb) {
        cb(e);
      }
    });
}

exports.tscheckMain = tscheckMain;

if (require.main === module) {
  tscheckMain();
}
