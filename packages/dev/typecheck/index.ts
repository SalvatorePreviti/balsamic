#!/usr/bin/env node

import ts from "typescript";
import fs from "fs";
import path from "path";

import { path as appRootPath } from "app-root-path";
import type { UnsafeAny } from "../types";
import { TsWorker } from "../init-ts-node";
import type { Input, Output } from "./_typecheck-worker";
import { devLog } from "../dev-log/dev-log";

async function loadProject(tsconfigFile: string): Promise<ts.ParsedCommandLine> {
  const configFileName = tsconfigFile;
  const configFileText = await fs.promises.readFile(configFileName, "utf8");
  const result = ts.parseConfigFileTextToJson(configFileName, configFileText);
  const configObject = result.config;
  const configParseResult = ts.parseJsonConfigFileContent(configObject, ts.sys, path.dirname(configFileName));
  configParseResult.options.noEmit = true;
  configParseResult.options.incremental = false;
  configParseResult.options.tsBuildInfoFile = undefined as UnsafeAny;
  return configParseResult;
}

export interface TsProject {
  parent: TsProject | null;
  tsconfigPath: string;
  tsconfig: ts.ParsedCommandLine;
  files: Set<string>;
}

export interface TsProjects {
  totalFiles: number;
  projects: TsProject[];
}

export async function loadProjects(
  input:
    | string
    | TsProject
    | readonly (string | null | undefined | false)[]
    | readonly (TsProject | null | undefined | false)[]
    | null
    | undefined = appRootPath,
): Promise<TsProjects> {
  const projectsStack: TsProject[] = [];

  const projects: TsProject[] = [];

  const projectsMap = new Map<string, TsProject>();

  const exploredDirectories = new Set<string>();

  const filesMap = new Map<string, TsProject>();

  const exploreDir = async (dir: string): Promise<void> => {
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
    input = [input as UnsafeAny];
  }

  for (const folder of input) {
    if (typeof folder === "object" && folder !== null) {
      if (!projectsMap.has(folder.tsconfigPath)) {
        projectsMap.set(folder.tsconfigPath, folder);
        projects.push(folder);
      }
    }
  }

  const explorePromises: Promise<void>[] = [];
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

export async function typecheckProjects(
  input:
    | string
    | TsProject
    | readonly (string | null | undefined | false)[]
    | readonly (TsProject | null | undefined | false)[] = appRootPath,
): Promise<void> {
  const projects = await loadProjects(input);

  let errors = 0;
  let warnings = 0;

  const workerPath = require.resolve("./_typecheck-worker");

  const typecheckProject = (projectInput: Input): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      let messageReceived = 100;
      const awaitMessage = (): void => {
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

      const worker = new TsWorker(workerPath, { workerData: projectInput });
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
      worker.on("message", (message: Output) => {
        messageReceived = -1;
        errors += message.errors | 0;
        warnings += message.warnings | 0;
      });
    });
  };

  const chunksCount = Math.max(1, require("os").cpus().length);

  // Split the projects in chunks
  const chunks: TsProject[][] = [];
  for (let i = 0; i < chunksCount; ++i) {
    chunks.push([]);
  }
  for (let i = 0; i < projects.projects.length; ++i) {
    chunks[i % chunksCount]!.push(projects.projects[i]!);
  }

  devLog.notice(`Typechecking ${projects.totalFiles} files in ${projects.projects.length} projects`);

  const inputs: Input[] = [];
  for (const chunk of chunks) {
    if (chunk.length > 0) {
      inputs.push({
        appRootPath,
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
  const promises: Promise<void>[] = [];

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
