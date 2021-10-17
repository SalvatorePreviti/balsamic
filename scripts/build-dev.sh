#!/bin/sh

set -e

tsc --project packages/dev/tsconfig-build.json
eslint --fix packages/dev/dist
prettier --write packages/dev/dist --loglevel warn
