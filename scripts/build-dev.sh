#!/bin/sh

set -e

rm -fr packages/dev/dist
npx tsc --project packages/dev/tsconfig-build.json
