import { PackageJsonParsed, devLog, devError, devChildTask, glob } from "@balsamic/dev";

import fsasync from "fs/promises";
import { Module } from "module";
import path from "path";
import fs from "fs";
import { parseFile } from "@swc/core";

export async function main() {
  const project = await PackageJsonParsed.readAsync("package.json", {
    strict: true,
    validateWorkspaceDependenciesVersions: true,
  });

  if (project.hasWarningsOrErrors) {
    devLog.error(project.validationMessagesToString());
    throw devError("package.json validation failed", { showStack: false });
  }

  const balsamicDev = project.getWorkspace("@balsamic/dev", true);

  await fsasync.rm("dist/dev", { maxRetries: 5, recursive: true, force: true });
  await fsasync.cp(balsamicDev.packageDirectoryPath!, "dist/dev", { recursive: true });

  // Remove init-ts-node.js from dist/dev.
  await fsasync.rm("dist/dev/init-ts-node.js", { force: true, maxRetries: 5 });
  await fsasync.rm("dist/dev/_packages.js", { force: true, maxRetries: 5 });

  const newPackageJson = { ...balsamicDev.toJSON(), private: false };
  delete newPackageJson.scripts;

  await fsasync.writeFile("dist/dev/package.json", JSON.stringify(newPackageJson, null, 2));

  await devChildTask.runModuleBin("typescript", "tsc", ["-p", "tsconfig.build.json"], {
    cwd: "dist/dev",
    title: `tsc ${balsamicDev.name}`,
    showStack: false,
  });

  await Promise.all(
    (await glob("dist/dev/tsconfig*.json")).map((item) => fsasync.rm(item, { force: true, maxRetries: 5 })),
  );

  // Copy init-ts-node.js to dist/dev.
  await fsasync.copyFile(
    "packages/dev/init-ts-node.js",
    "dist/dev/init-ts-node.js",
    fsasync.constants.COPYFILE_FICLONE,
  );

  // Copy init-ts-node.js to dist/dev.
  await fsasync.copyFile("packages/dev/_packages.js", "dist/dev/_packages.js", fsasync.constants.COPYFILE_FICLONE);

  await Promise.all((await glob("dist/dev/**/index.js")).map((item) => transpileLazyExportStar(item)));

  // chmod +x dist/dev/bin/devrun.js
  await fsasync.chmod("dist/dev/bin/devrun.js", 0o755);
}

async function transpileLazyExportStar(sourceFilePath: string) {
  if (sourceFilePath.endsWith(".js")) {
    const tsSourceFileath = `${sourceFilePath.slice(0, -2)}ts`;

    if (fs.existsSync(tsSourceFileath)) {
      const parsed = await parseFile(tsSourceFileath, {
        syntax: "typescript",
      });

      // If the file contains only imports and exports it can be deleted
      let hasOnlyExports = true;
      for (const statement of parsed.body) {
        if (statement.type === "ExportNamedDeclaration" && statement.source) {
          continue;
        }

        if (statement.type !== "ImportDeclaration" && statement.type !== "ExportAllDeclaration") {
          hasOnlyExports = false;
          break;
        }
      }

      if (hasOnlyExports) {
        console.log(`- Deleting ${tsSourceFileath} because it only contains exports`);
        await fsasync.rm(tsSourceFileath);
      }
    }
  }

  const source = await fsasync.readFile(sourceFilePath, "utf8");
  const lines = source.split("\n");

  sourceFilePath = path.resolve(sourceFilePath);
  const allRequires = new Set<string>();

  const plainRequires = new Set<string>();
  for (const line of lines) {
    if (line.startsWith('require("') && line.endsWith('");')) {
      plainRequires.add(JSON.parse(line.replace("require(", "").replace(");", "")));
    }
  }

  let hasLazyRequires = false;
  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i] || "";

    if (line.startsWith('__exportStar(require("') && line.endsWith('"), exports);')) {
      const req = JSON.parse(line.replace("__exportStar(require(", "").replace("), exports);", ""));
      if (!plainRequires.has(req)) {
        lines[i] = `__exstarLazy(__rlazy(${JSON.stringify(req)}), exports);`;
        allRequires.add(req);
        hasLazyRequires = true;
      }
    }
  }

  let output = lines.join("\n");

  if (hasLazyRequires) {
    const requireFromPath = Module.createRequire(sourceFilePath);

    const rlazyData: Record<string, unknown> = {};
    for (const req of allRequires) {
      rlazyData[req] = Object.getOwnPropertyNames(requireFromPath(req)).filter(
        (name) => name !== "default" && name !== "__esModule",
      );
    }

    output += `\nvar __rlazyData;`;

    output += `function __rlazy(a) {if(!__rlazyData)__rlazyData=${JSON.stringify(rlazyData)};return a;}`;

    output +=
      "\nfunction __exstarLazy(a,b) {let l=1;__rlazyData[a]&&__rlazyData[a].forEach((k)=>{let c=__rlazyData;Reflect.defineProperty(b,k,{configurable:true,enumerable:true,get(){if (c===__rlazyData){c=require(a);if(l){l=0;__exportStar(c,b);}}return c[k]}})});delete __rlazyData[a];}";
  }

  if (output !== source) {
    await fsasync.writeFile(sourceFilePath, output, "utf8");
  }
}
