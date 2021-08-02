const path = require('path')
const manifest = require('../../package.json')
const logging = require('./logging')
const fs = require('fs')
const { sortObjectKeys } = require('eslint-plugin-quick-prettier/json-utils.js')
const chalk = require('chalk')
const {
  loadPackageJson,
  rewritePackageJson,
  copyProjectFile,
  createProjectFile,
  findDirectoryInParents,
  cleanupText,
  runAsync,
  getPackageManager
} = require('./fs-utils')

module.exports = {
  initProject,
  initNpmIgnore,
  initClangFormat
}

function initNpmIgnore() {
  logging.banner('.npmignore initialization')
  copyProjectFile('.npmignore.default', '.npmignore')
  logging.log()
}

function initClangFormat() {
  logging.banner('clang-format initialization')
  copyProjectFile('.clang-format')
  logging.log()
}

async function initProject() {
  logging.banner('project initialization')

  if (!findDirectoryInParents('.git')) {
    if (await logging.askConfirmation(`.git not found. Do you want to run ${chalk.yellow('git init')}?`)) {
      await runAsync('git', ['init'])
    }
  }

  if (!fs.existsSync('package.json')) {
    logging.warn('package.json not found - creating a new project')
    logging.log()
    await runAsync('npm', 'init')
  }

  const originalProject = loadPackageJson('package.json')

  const project = JSON.parse(JSON.stringify(originalProject))

  if (project.private === undefined) {
    project.private = !!(await logging.askConfirmation(
      `Is this a ${chalk.yellowBright('private')}${chalk.yellow(': ')}${chalk.greenBright('true')} package?`
    ))
  }

  createProjectFiles()
  fixProjectFields(project)

  const hasGitHooks = initGitHooks(project)

  addDependencies(project, { hasGitHooks })

  rewritePackageJson('package.json', project)

  if (getPackageManager() === 'yarn') {
    logging.footer('Initialization completed. run `yarn` to complete initialization.')
  } else {
    logging.footer('Initialization completed. run `npm i` to complete initialization.')
  }
}

function createProjectFiles() {
  createProjectFile(
    'tsconfig.json',
    cleanupText(JSON.stringify({ extends: '@balsamic/eslint-config/tsconfig.json' }, null, 2))
  )

  createProjectFile(
    ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.json'],
    cleanupText(JSON.stringify({ extends: ['@balsamic'] }, null, 2))
  )

  copyProjectFile('.gitignore.default', '.gitignore')
  copyProjectFile('.prettierignore')
  copyProjectFile('.eslintignore')
  copyProjectFile('.editorconfig')
  copyProjectFile('.prettierrc')
  copyProjectFile('.vscode/settings.json')
  copyProjectFile('.vscode/extensions.json')
}

function initGitHooks(project) {
  if (!findDirectoryInParents('.git')) {
    logging.skip('git hooks skipped, not a git repo')
    return false
  }

  createProjectFile('.husky/pre-commit', 'npm run precommit\n')
  try {
    fs.chmodSync('.husky/pre-commit', '755')
  } catch (_) {
    // Ignore error
  }

  createProjectFile('.husky/.gitignore', '_\n')
  const scripts = project.scripts || (project.scripts = {})

  const precommitScript = 'lint-staged && pretty-quick --staged'
  const postInstallScript = 'husky install'

  if (!project['int-staged']) {
    project['lint-staged'] = {
      '*.{js,jsx,ts,tsx}': ['eslint --fix --max-warnings=0']
    }
  }

  if (!scripts.precommit) {
    logging.progress('adding precommit script ...')
    scripts.precommit = precommitScript
  } else if (scripts.precommit !== precommitScript) {
    logging.skip('precommit script already present, skipping', precommitScript)
  } else {
    logging.skip('precommit script already present')
  }

  if (!scripts.postinstall) {
    logging.progress('adding postinstall script ...')
    scripts.postinstall = postInstallScript
  } else if (scripts.postinstall !== postInstallScript) {
    logging.skip('postinstall script already present, skipping', postInstallScript)
  } else {
    logging.skip('postinstall script already present')
  }
  return true
}

function fixProjectFields(project) {
  if (!project.name) {
    project.name = path.dirname(process.cwd())
    logging.progress(`project name is now ${project.name}`)
  }
  project.engines = { ...manifest.engines, ...project.engines }
  if (!project.license) {
    project.license = 'ISC'
    logging.progress(`project license is now ${project.license}`)
  }
  if (!project.keywords) {
    project.keywords = [project.name]
    logging.progress('added project keywords', project.keywords)
  }
}

function addDependencies(project, { hasGitHooks }) {
  const dependenciesAdded = []
  const existingDeps = getAllProjectDependencies(project)

  const devDependencies = sortObjectKeys(project.devDependencies) || {}

  const addDevDependency = (key, value) => {
    if ((!existingDeps[key] && !devDependencies[key]) || semverCompare(existingDeps[key], devDependencies[key]) < 0) {
      dependenciesAdded.push(key)
      devDependencies[key] = value
    }
  }

  addDevDependency(manifest.name, `^${manifest.version}`)

  for (const [key, value] of Object.entries(sortObjectKeys(manifest.peerDependencies))) {
    addDevDependency(key, value.replace('>=', '^'))
  }

  const extraDependencies = require('./extra-packages/package.json').devDependencies

  if (hasGitHooks) {
    addDevDependency('husky', extraDependencies.husky)
    addDevDependency('lint-staged', extraDependencies['lint-staged'])
    addDevDependency('pretty-quick', extraDependencies['pretty-quick'])
  }

  if (existingDeps.react) {
    addDevDependency('eslint-plugin-react', extraDependencies['eslint-plugin-react'])
    addDevDependency('eslint-plugin-react-hooks', extraDependencies['eslint-plugin-react-hooks'])
  }

  let hasChai = !!existingDeps.chai

  if (existingDeps.mocha) {
    addDevDependency('eslint-plugin-mocha', extraDependencies['eslint-plugin-mocha'])
    addDevDependency('@types/mocha', extraDependencies['@types/mocha'])
    addDevDependency('chai', extraDependencies.chai)
    hasChai = true
  }

  if (hasChai) {
    addDevDependency('eslint-plugin-chai-expect', extraDependencies['eslint-plugin-chai-expect'])
    addDevDependency('@types/chai', extraDependencies['@types/chai'])
  }

  if (dependenciesAdded.length !== 0) {
    project.devDependencies = devDependencies
    logging.progress('added dependencies:', dependenciesAdded)
  } else {
    logging.skip('no dependencies to add')
  }
}

function getAllProjectDependencies(project) {
  const result = {}
  for (const mkey of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const arg = project[mkey]
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (!(key in result)) {
          result[key] = value
        }
      }
    }
  }
  return result
}

function semverCompare(a, b) {
  a = (typeof a === 'string' && a.replace(/[^0-9*.]/g, '')) || ''
  b = (typeof b === 'string' && b.replace(/[^0-9*.]/g, '')) || ''
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < 3; i++) {
    const na = Number.parseInt(pa[i])
    const nb = Number.parseInt(pb[i])
    if (na > nb) {
      return 1
    }
    if (nb > na) {
      return -1
    }
    if (!isNaN(na) && isNaN(nb)) {
      return 1
    }
    if (isNaN(na) && !isNaN(nb)) {
      return -1
    }
  }
  return 0
}
