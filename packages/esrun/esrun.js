#!/usr/bin/env node --experimental-import-meta-resolve --require=@balsamic/esrun/register.cjs --loader=@balsamic/esrun/loader.mjs
"use strict";

if (process.argv.indexOf("--build", 2) > 0) {
  require("./esrun-build.js").esrunBuildMain();
} else {
  require("./esrun-main.js").esrunMain();
}
