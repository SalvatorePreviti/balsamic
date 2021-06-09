const path = require('path')
const ts = require('typescript')
const fs = require('fs')

module.exports = {
  buildDts
}

const defaultTypescriptCompilerOptions = {
  allowJs: true,
  allowSyntheticDefaultImports: true,
  allowUmdGlobalAccess: true,
  allowUnreachableCode: true,
  allowUnusedLabels: true,
  alwaysStrict: true,
  charset: 'utf8',
  checkJs: false,
  disableSolutionSearching: true,
  downlevelIteration: false,
  emitDecoratorMetadata: false,
  esModuleInterop: true,
  experimentalDecorators: true,
  forceConsistentCasingInFileNames: true,
  importHelpers: false,
  importsNotUsedAsValues: 'remove',
  jsx: 'react',
  lib: ['dom', 'dom.iterable', 'esnext', 'webworker'],
  module: 'esnext',
  moduleResolution: 'node',
  newLine: 'lf',
  noEmit: true,
  noEmitOnError: false,
  noFallthroughCasesInSwitch: true,
  noImplicitAny: true,
  noImplicitReturns: true,
  noImplicitThis: true,
  noStrictGenericChecks: false,
  noUnusedLocals: false,
  noUnusedParameters: false,
  preserveConstEnums: false,
  preserveWatchOutput: true,
  pretty: true,
  resolveJsonModule: true,
  skipDefaultLibCheck: true,
  skipLibCheck: true,
  strict: true,
  strictBindCallApply: true,
  strictFunctionTypes: true,
  strictNullChecks: true,
  strictPropertyInitialization: false,
  stripInternal: true,
  suppressExcessPropertyErrors: true,
  suppressImplicitAnyIndexErrors: false,
  target: 'ESNext',
  useDefineForClassFields: false
}

/** @type {ts.CompilerOptions} */
const forcedTypescriptCompilerOptions = {
  allowJs: false,
  checkJs: false,
  declaration: true,
  noEmit: false,
  emitDeclarationOnly: true,
  assumeChangesOnlyAffectDirectDependencies: true,
  disableReferencedProjectLoad: true,
  disableSolutionSearching: true,
  disableSourceOfProjectReferenceRedirect: true,
  disableSizeLimit: true,
  preserveConstEnums: true,
  skipDefaultLibCheck: true,
  sourceMap: false,
  declarationMap: false,
  skipLibCheck: true,
  noEmitOnError: false,
  composite: false,
  declarationDir: undefined,
  forceConsistentCasingInFileNames: true,
  out: undefined,
  outDir: undefined,
  outFile: undefined,
  project: undefined,
  mapRoot: undefined,
  inlineSourceMap: false,
  inlineSources: false,
  traceResolution: false,
  rootDir: undefined,
  rootDirs: undefined,
  sourceRoot: undefined
}

function generateTypescriptOptions(cwd) {
  const configFile = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')
  const projectConfig = configFile && ts.readConfigFile(configFile, ts.sys.readFile)

  const parsed = ts.parseJsonConfigFileContent(
    {
      ...projectConfig.config,
      compilerOptions: {
        ...defaultTypescriptCompilerOptions,
        ...((projectConfig && projectConfig.config && projectConfig.config.compilerOptions) || undefined),
        incremental: false,
        tsBuildInfoFile: undefined
      },
      compileOnSave: false,
      watchOptions: undefined,
      include: [],
      exclude: []
    },
    ts.sys,
    cwd
  )

  return { ...parsed.options, ...forcedTypescriptCompilerOptions }
}

async function buildDts({ files, cwd }) {
  const options = generateTypescriptOptions(cwd, files)

  const inputFilesCache = new Map()
  const inputDirectoriesCache = new Set()

  async function prereadFile(fileName) {
    try {
      const contents = await fs.promises.readFile(fileName, 'utf8')
      inputFilesCache.set(fileName, contents)
      let dir = path.dirname(fileName)
      while (!inputDirectoriesCache.has(dir)) {
        inputDirectoriesCache.add(dir)
        dir = path.dirname(dir)
      }
    } catch (_) {}
  }

  const readPromises = []
  const readDirPromises = []
  for (const file of files) {
    readPromises.push(prereadFile(file))
  }

  const readDirDtsFiles = async (folderPath) => {
    try {
      for (const fname of await fs.promises.readdir(folderPath)) {
        if (fname.endsWith('.d.ts')) {
          readPromises.push(prereadFile(path.join(folderPath, fname)))
        }
      }
    } catch (_) {}
  }

  try {
    readDirPromises.push(readDirDtsFiles(path.join(path.dirname(require.resolve('typescript/package.json')), 'lib')))
  } catch (_) {}

  try {
    readDirPromises.push(readDirDtsFiles(path.dirname(require.resolve('@types/node/package.json'))))
  } catch (_) {}

  const host = ts.createCompilerHost(options)

  const writePromises = []
  const writeErrors = []

  const writeFileAsync = async (fileName, data) => {
    if (fileName.endsWith('.d.ts')) {
      data = `/* eslint-disable */ // prettier-ignore\n\n${data}`
      if (!data.endsWith('\n')) {
        data += '\n'
      }
    }

    let isDifferent = true
    try {
      isDifferent = (await fs.promises.readFile(fileName, 'utf8')) !== data
    } catch (_) {}

    if (isDifferent) {
      try {
        await fs.promises.writeFile(fileName, data)
      } catch (error) {
        writeErrors.push(`Could not write '${fileName}': ${error}`)
      }
    }
  }

  const tsReadFile = host.readFile
  const tsFileExists = host.fileExists
  const tsDirectoryExists = host.directoryExists

  host.getCurrentDirectory = () => cwd

  host.directoryExists = (directoryName) => {
    return inputDirectoriesCache.has(directoryName) || tsDirectoryExists(directoryName)
  }

  host.fileExists = (fileName) => {
    const cached = inputFilesCache.get(fileName)
    return cached !== undefined || tsFileExists(fileName)
  }

  host.readFile = (filename) => {
    const cached = inputFilesCache.get(filename)
    return cached !== undefined ? cached : tsReadFile(filename)
  }

  host.writeFile = (fileName, data) => {
    writePromises.push(writeFileAsync(fileName, data))
  }

  await Promise.all(readDirPromises)
  await Promise.all(readPromises)

  // Prepare and emit the d.ts files
  const program = ts.createProgram({ options, rootNames: files, host })

  const emitResult = program.emit()

  const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

  await Promise.all(writePromises)

  for (const messageText of writeErrors) {
    allDiagnostics.push({
      file: undefined,
      start: undefined,
      length: undefined,
      messageText,
      category: 1,
      code: 5033,
      reportsUnnecessary: undefined,
      reportsDeprecated: undefined
    })
  }

  if (allDiagnostics.length > 0) {
    console.log(ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host))
    return false
  }

  return true
}