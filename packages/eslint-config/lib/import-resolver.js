"use strict";

const resolve = require("resolve");
const path = require("path");

const { importableExtensions } = require("./config");

exports.interfaceVersion = 2;

exports.resolve = function (source, file, config) {
  let resolvedPath;

  if (resolve.isCore(source)) {
    return { found: true, path: null };
  }

  // Allow to import ./xxx/xxx?raw
  const indexOfQuestionMark = typeof source === "string" ? source.indexOf("?") : source;
  if (indexOfQuestionMark > 0) {
    source = source.slice(0, indexOfQuestionMark);
  }

  try {
    resolvedPath = resolve.sync(source, opts(file, config));
    return { found: true, path: resolvedPath };
  } catch (err) {
    return { found: false };
  }
};

function opts(file, config) {
  return Object.assign({ extensions: importableExtensions }, config, {
    basedir: path.dirname(path.resolve(file)),
    packageFilter,
  });
}

function packageFilter(pkg) {
  if (pkg.module) {
    pkg.main = pkg.module || pkg.main;
  } else if (pkg["jsnext:main"]) {
    pkg.main = pkg["jsnext:main"];
  }
  return pkg;
}
