const { Module } = require("module");
const path = require("path");

initTsNode();

function initTsNode() {
  const cwdRequire = Module.createRequire(path.resolve(process.cwd(), "_"));
  const tryRequire = (id) => {
    try {
      cwdRequire(id);
    } catch (e) {
      if (e.code === "MODULE_NOT_FOUND") {
        try {
          require(id);
        } catch {}
      }
    }
  };

  if (!global[Symbol.for("_tsNodeInitialized")]) {
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
