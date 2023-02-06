const { Module } = require("module");
const path = require("path");

initTsNode();

function initTsNode() {
  if (!global[Symbol.for("_tsNodeInitialized")]) {
    const cwdRequire = Module.createRequire(path.resolve(process.cwd(), "_"));
    const tryRequire = (id) => {
      try {
        cwdRequire(id);
      } catch (e) {
        if (e.code === "MODULE_NOT_FOUND") {
          try {
            Module.createRequire(process.argv[1] || require.main.filename)(id);
          } catch {
            try {
              require(id);
            } catch {}
          }
        }
      }
    };

    global[Symbol.for("_tsNodeInitialized")] = true;
    tryRequire("ts-node/register/transpile-only");
    tryRequire("tsconfig-paths/register");
  }

  // Modify process.execArgv to include the current file.
  const execArgvSet = new Set(process.execArgv);
  if (
    !execArgvSet.has(__filename) &&
    !execArgvSet.has("@balsamic/dev/init-ts-node") &&
    !execArgvSet.has("@balsamic/dev/init-ts-node.js")
  ) {
    process.execArgv.unshift("-r", __filename);
  }
}
