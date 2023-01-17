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
};

if (isMainModule(module)) {
  void devRunMain(module);
}
