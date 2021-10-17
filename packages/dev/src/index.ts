/// <reference path="./lib/types.ts" />

import { asyncDelay, devRunMain, runParallel, runSequential } from './lib/promises'

export type {
  Awaited,
  PackageJson,
  PackageJsonExportCondition,
  PackageJsonExports,
  PackageJsonPublishConfig,
  PackageJsonScripts,
  PackageJsonWorkspaceConfig
} from './lib/types'

export {
  initialCwd,
  millisecondsToString,
  makePathRelative,
  toUTF8,
  startMeasureTime,
  utf8ByteLength,
  prettySize
} from './lib/utils'

export { resolveModulePackageJson, resolveModuleBin } from './lib/resolve'

export { loadDotEnv } from './lib/dot-env'

export { devError } from './lib/dev-error'

export { devLog, chalk, getProcessTitle, setProcessTitle } from './lib/dev-log'

export type { DevLogTimeOptions } from './lib/dev-log'

export { asyncDelay, devRunMain, runParallel, runSequential }

export { devChildTask } from './lib/dev-child-task'

export { getPackagesFolders } from './lib/get-packages-folders'

export type {
  PackagesFolderInput,
  PackagesFolderResult,
  PackagesFoldersEntry,
  GetPackagesFoldersOptions
} from './lib/get-packages-folders'
