#!/usr/bin/env node --experimental-import-meta-resolve --require=@balsamic/esrun/register.cjs --loader=@balsamic/esrun/loader.mjs
'use strict'

require('./esrun-main.js').esrunMain()
