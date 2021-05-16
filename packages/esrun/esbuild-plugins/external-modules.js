const { resolve: pathResolve, sep: pathSep } = require('path')
const Module = require('module')

const _nodeModulesDir = `${pathSep}node_modules${pathSep}`
const _requireByDirCache = new Map()

/**
 * @returns {import('esbuild').Plugin}
 */
const esbuildPluginExternalModules = () => {
  return {
    name: 'esrun-external-modules',

    /** @param {import('esbuild').PluginBuild} build */
    setup(build) {
      build.onResolve({ namespace: 'file', filter: /\/node_modules\// }, ({ path }) => {
        return { path, external: true }
      })

      build.onResolve({ namespace: 'file', filter: /^[a-zA-Z@_]/ }, ({ path, resolveDir }) => {
        const split = path.split('/', 3)
        let id = split[0]
        if (!id) {
          return null
        }

        if (path.startsWith('@')) {
          id = `${split[0]}/${split[1]}`
        }

        try {
          const key = pathResolve(resolveDir, 'index.js')

          let moduleResolve = _requireByDirCache.get(key)
          if (moduleResolve === undefined) {
            moduleResolve = Module.createRequire(key).resolve
            _requireByDirCache.set(key, moduleResolve)
          }

          const resolved = moduleResolve(`${id}/package.json`)
          if (resolved.indexOf(_nodeModulesDir) >= 0) {
            return { path, external: true }
          }
        } catch (_) {}
        return null
      })
    }
  }
}

module.exports = esbuildPluginExternalModules
