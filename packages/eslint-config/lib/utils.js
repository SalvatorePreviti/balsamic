const { dirname: pathDirname, join: pathJoin } = require("path");
const { realpathSync: fsRealPathSync, statSync: fsStatSync } = require("fs");

function findFileInParents(filename) {
  let dir = process.cwd();
  if (dir.indexOf("node_modules") > 0) {
    dir = fsRealPathSync(dir);
  }
  for (;;) {
    const configFile = pathJoin(dir, filename);
    if (isFile(configFile)) {
      return configFile;
    }
    const parent = pathDirname(dir);
    if (dir.length <= parent.length) {
      return "";
    }
    dir = parent;
  }
}

function isFile(filename) {
  try {
    const stats = fsStatSync(filename);
    return stats.isFile() || stats.isFIFO();
  } catch {}
  return false;
}

module.exports = {
  findFileInParents,
  isFile,
};
