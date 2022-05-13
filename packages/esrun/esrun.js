#!/usr/bin/env node --experimental-import-meta-resolve --require=@balsamic/esrun/register.cjs --loader=@balsamic/esrun/loader.mjs
"use strict";

if (process.argv.indexOf("--build", 2) > 0) {
  void require("./esrun-build.js").esrunBuildMain();
} else {
  void require("./esrun-main.js").esrunMain();
}
