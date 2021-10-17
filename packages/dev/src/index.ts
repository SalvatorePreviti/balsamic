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
  resolveModulePackageJson,
  toUTF8,
  startMeasureTime,
  utf8ByteLength,
  prettySize
} from './lib/utils'

export { loadDotEnv } from './lib/dot-env'

export { devError } from './lib/dev-error'

export { devLog, chalk, getProcessTitle, setProcessTitle } from './lib/dev-log'

export type { DevLogTimeOptions } from './lib/dev-log'

export { asyncDelay, devRunMain, runParallel, runSequential }

export { devChildTask } from './lib/dev-child-task'

export { getPackagesFolders } from './lib/get-package-folders'

export type {
  GetPackageFoldersItem,
  GetPackageFoldersResult,
  GetPackageFoldersResultItem,
  GetPackagesFoldersOptions
} from './lib/get-package-folders'
