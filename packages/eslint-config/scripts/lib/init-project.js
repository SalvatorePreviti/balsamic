const path = require('path')
const manifest = require('../../package.json')
const logging = require('./logging')
const fs = require('fs')
const { sortObjectKeys } = require('eslint-plugin-quick-prettier/json-utils.js')
const {
  loadPackageJson,
  rewritePackageJson,
  copyProjectFile,
  createProjectFile,
  findDirectoryInParents,
  cleanupText,
  runAsync
} = require('./fs-utils')

module.exports = {
  initProject,
  initClangFormat
}

function initClangFormat() {
  logging.banner('clang-format initialization')
  copyProjectFile('.clang-format')
}

async function initProject() {
  logging.banner('project initialization')

  if (!fs.existsSync('package.json')) {
    logging.warn('package.json not found - creating a new project')
    logging.log()
    await runAsync('npm', 'init')
  }

  const originalProject = loadPackageJson('package.json')

  const project = JSON.parse(JSON.stringify(originalProject))

  createProjectFiles()
  fixProjectFields(project)

  const hasGitHooks = initGitHooks(project)

  addDependencies(project, { hasGitHooks })

  rewritePackageJson('package.json', project)

  logging.footer('Initialization completed. run `npm i` or `yarn` to complete initialization.')
}

function createProjectFiles() {
  createProjectFile('tsconfig.json', cleanupText(JSON.stringify({ extends: '@balsamic/eslint-config' }, null, 2)))

  createProjectFile(
    ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.json'],
    cleanupText(JSON.stringify({ extends: ['@balsamic'] }, null, 2))
  )

  copyProjectFile('.gitignore.default', '.gitignore')
  copyProjectFile('.editorconfig')
  copyProjectFile('.eslintignore')
  copyProjectFile('.prettierignore')
  copyProjectFile('.vscode/settings.json')
  copyProjectFile('.vscode/extensions.json')
}

function initGitHooks(project) {
  if (!findDirectoryInParents('.git')) {
    logging.skip('git hooks skipped, not a git repo')
    return false
  }

  createProjectFile('.husky/pre-commit', 'npm run precommit\n')
  createProjectFile('.husky/.gitignore', '_\n')
  const scripts = project.scripts || (project.scripts = {})

  const precommitScript = 'lint-staged && pretty-quick --staged'
  const postInstallScript = 'husky install'

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
    if (!existingDeps[key] && !devDependencies[key]) {
      dependenciesAdded.push(key)
      devDependencies[key] = value
    }
  }

  addDevDependency(manifest.name, `^${manifest.version}`)

  for (const [key, value] of Object.entries(sortObjectKeys(manifest.peerDependencies))) {
    addDevDependency(key, value.replace('>=', '^'))
  }

  if (hasGitHooks) {
    addDevDependency('husky', '^6.0.0')
    addDevDependency('lint-staged', '^11.0.0')
    addDevDependency('pretty-quick', '^3.1.0')
  }

  if (existingDeps.react) {
    addDevDependency('eslint-plugin-react', '^7.23.2')
    addDevDependency('eslint-plugin-react-hooks', '^4.2.0')
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
