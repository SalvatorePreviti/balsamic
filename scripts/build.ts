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
  await fsasync.rm("dist/dev/lib/_ts-worker-thread-require.js", { force: true, maxRetries: 5 });

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

  await fsasync.copyFile(
    "packages/dev/init-ts-node.js",
    "dist/dev/init-ts-node.js",
    fsasync.constants.COPYFILE_FICLONE,
  );

  await fsasync.copyFile("packages/dev/_packages.js", "dist/dev/_packages.js", fsasync.constants.COPYFILE_FICLONE);

  await fsasync.copyFile(
    "packages/dev/lib/_ts-worker-thread-require.js",
    "dist/dev/lib/_ts-worker-thread-require.js",
    fsasync.constants.COPYFILE_FICLONE,
  );

  for (const item of await glob("dist/dev/**/*.js")) {
    await transpileLazyExportStar(item);
  }

  const chmodPromises: Promise<void>[] = [];
  const filesToChmodPlusX = await fsasync.readdir("dist/dev/bin", { withFileTypes: true });
  for (const item of filesToChmodPlusX) {
    if (item.isFile() && (item.name.endsWith(".js") || item.name.endsWith(".cjs") || item.name.endsWith(".mjs"))) {
      // chmod +x
      chmodPromises.push(fsasync.chmod(path.join("dist/dev/bin", item.name), 0o755));
    }
  }
  await Promise.all(chmodPromises);
}

async function transpileLazyExportStar(jsSourceFilePath: string) {
  let hasOnlyImportsAndExports = true;

  let tsSourceFilePath: string | null = null;

  if (jsSourceFilePath.endsWith(".js")) {
    tsSourceFilePath = `${jsSourceFilePath.slice(0, -2)}ts`;
    if (fs.existsSync(tsSourceFilePath)) {
      const parsed = await parseFile(tsSourceFilePath, {
        syntax: "typescript",
      });

      for (const statement of parsed.body) {
        if (statement.type === "ExportNamedDeclaration" && statement.source) {
          continue;
        }

        if (statement.type !== "ImportDeclaration" && statement.type !== "ExportAllDeclaration") {
          hasOnlyImportsAndExports = false;
          break;
        }
      }
    } else {
      tsSourceFilePath = null;
    }
  }

  if (hasOnlyImportsAndExports || path.basename(jsSourceFilePath) === "index.js") {
    const source = await fsasync.readFile(jsSourceFilePath, "utf8");
    const lines = source.split("\n");

    jsSourceFilePath = path.resolve(jsSourceFilePath);

    const plainRequires = new Set<string>();
    for (const line of lines) {
      if (line.startsWith('require("') && line.endsWith('");')) {
        plainRequires.add(JSON.parse(line.replace("require(", "").replace(");", "")));
      }
    }

    const requireFromPath = Module.createRequire(jsSourceFilePath);

    const processedExportAll = new Set<string>();

    let needsSpecialBinding = false;

    for (let i = 0; i < lines.length; ++i) {
      const line = lines[i] || "";

      if (line.startsWith('__exportStar(require("') && line.endsWith('"), exports);')) {
        let req = JSON.parse(line.replace("__exportStar(require(", "").replace("), exports);", ""));
        if (req) {
          req = JSON.parse(`"${req}"`);
        }
        if (req && !plainRequires.has(req) && !processedExportAll.has(req)) {
          processedExportAll.add(req);

          const sreq = JSON.stringify(req);

          const exportedSymbols = Object.getOwnPropertyNames(requireFromPath(req)).filter(
            (name) => name !== "default" && name !== "__esModule",
          );

          let src = "";

          if (!needsSpecialBinding) {
            needsSpecialBinding = true;
            src += "function __createBindingSP(m,k){";
            src += "let d=Object.getOwnPropertyDescriptor(m,k);";
            src += 'if(!d||("get" in d ? !m.__esModule : d.writable||d.configurable))';
            src += "d={enumerable:true,get(){return m[k]}};";
            src += "d.configurable=true;";
            src += "Reflect.defineProperty(exports,k,d);return m[k]}\n";
            src +=
              "function __createBindingSPLazy(ks,r){for(const k of ks)Reflect.defineProperty(exports,k,{enumerable:true,get:()=>__createBindingSP(r(),k)})}\n";
          }

          src += `{let R=()=>{const r=require(${sreq});R=()=>r;return r;};__createBindingSPLazy(`;
          src += JSON.stringify(exportedSymbols);
          src += ",R)}";

          lines[i] = src;
        }

        continue;
      }

      // Use exportImportStarRegex
      const match = /^\s*exports\.([\w$_]+)\s*=\s*__importStar\(require\("(.*)"\)\)\s*;?\s*$/g.exec(line);
      if (match) {
        const prop = match[1];
        let req = match[2];
        if (req) {
          req = JSON.parse(`"${req}"`);
        }
        if (prop && req && !plainRequires.has(req)) {
          const sprop = JSON.stringify(prop);
          const sreq = JSON.stringify(req);
          lines[i] =
            `{let r=module;Reflect.defineProperty(exports, ${sprop}, {configurable:true,enumerable:true,get(){return r===module?r=__importStar(require(${sreq})):r;},set(v){r=v;}});}`;
        }
        continue;
      }
    }

    const output = lines.join("\n");

    const changed = output !== source;
    if (changed) {
      await fsasync.writeFile(jsSourceFilePath, output, "utf8");
    }

    if (changed && hasOnlyImportsAndExports && tsSourceFilePath) {
      console.log(`- Deleting ${tsSourceFilePath} because it only contains imports and exports`);
      await fsasync.rm(tsSourceFilePath);

      // Delete map file
      const mapFilePath = `${jsSourceFilePath}.map`;
      try {
        await fsasync.rm(mapFilePath);
      } catch {}
    }
  }
}
