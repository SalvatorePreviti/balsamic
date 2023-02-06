#!/usr/bin/env node

// Allow loading typescript files.
require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

const { isMainModule, devRunMain, PackageJsonParsed, devLog, devError, devChildTask, glob } = require("@balsamic/dev");
const fsasync = require("fs/promises");

module.exports = async function build() {
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
  await fsasync.cp(balsamicDev.packageDirectoryPath, "dist/dev", { recursive: true });

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

  // chmod +x dist/dev/bin/devrun.js
  await fsasync.chmod("dist/dev/bin/devrun.js", 0o755);
};

if (isMainModule(module)) {
  void devRunMain(module);
}
