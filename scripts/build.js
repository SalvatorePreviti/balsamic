// Allow loading typescript files.
require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

const { isMainModule, devRunMain, PackageJsonParsed, devLog, devError, devChildTask } = require("@balsamic/dev");
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

  await fsasync.mkdir("dist/packages", { recursive: true });
  await fsasync.rm("dist/packages/dev", { maxRetries: 5, recursive: true, force: true });
  await fsasync.cp(balsamicDev.packageDirectoryPath, "dist/packages", { recursive: true });

  await fsasync.writeFile(
    "dist/packages/dev/package.json",
    JSON.stringify({ ...balsamicDev.toJSON(), private: false }),
  );

  await devChildTask.npmCommand("typescript", "tsc", ["-p", "tsconfig.build.json"], { cwd: "dist/packages/dev" });
};

if (isMainModule(module)) {
  void devRunMain(module);
}
