#!/usr/bin/env node
"use strict";

const { main, handleUncaughtError } = require("./lib/balsamic-eslint");

main(process.argv).catch(handleUncaughtError);
