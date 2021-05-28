const fs = require('fs')

const tryMkDir = (dir) => {
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (_) {}
}

function xmur3(str) {
  let i = 0
  let h = 1779033703 ^ str.length
  for (; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

const rand = xmur3('hello')

const randArray = () => {
  const buf = new Uint32Array(50)
  for (let i = 0; i < buf.length; ++i) {
    buf[i] = rand()
  }
  return Buffer.from(buf).toString('hex')
}

function generateFiles(folder, format = 'ts') {
  let indexContent = ''
  indexContent += "import crypto from 'crypto'\n\n"

  const IMAX = 25
  const JMAX = 50

  tryMkDir(folder)

  const importExt = format === 'ts' ? '' : `.${format}`

  for (let i = 0; i < IMAX; ++i) {
    tryMkDir(`${folder}/x${i}`)

    let fdir = ''
    let fname = ''
    for (let j = 0; j < JMAX; ++j) {
      let contents = ''
      if (fname) {
        contents += `import { fn as importedFn } from './${fname}${importExt}'\n\n`
        contents += `export let fn = () => importedFn() + ${j}\n\n`
        contents += `export const setFn = (value${format === 'ts' ? ': any' : ''}) => (fn = value)\n\n`
        for (let k = 0; k < 250; ++k) {
          contents += `export const d${k} = () =>\n  '${randArray()}'\n\n`
        }
      } else {
        contents += `import chalk from 'chalk'\n\n`
        contents += `export const fn = (x = 'X') => {\n`
        contents += `  const keys = Object.keys(chalk);\n`
        contents += `  return x + keys[${i + j} % keys.length] + '${i}-${j}:'\n`
        contents += `}\n`
      }
      fdir = `x${i}`
      fname = `file-${i}-${j}`
      fs.writeFileSync(`${folder}/${fdir}/${fname}.${format}`, contents)
    }

    indexContent += `import { fn as fn${i} } from './${fdir}/${fname}${importExt}'\n`
  }

  indexContent += '\nexport const xxx = () =>\n'
  for (let i = 0; i < IMAX; ++i) {
    indexContent += `  fn${i}()${i < IMAX - 1 ? ' + \n' : '\n\n'}`
  }
  indexContent += "const hash = crypto.createHash('md5').update(xxx()).digest().toString('hex')\n\n"
  indexContent += '// eslint-disable-next-line no-console\n'
  indexContent += 'console.log(hash);\n'

  fs.writeFileSync(`${folder}/index.${format}`, indexContent)
}

generateFiles('__test/mjs', 'mjs')
generateFiles('__test/ts', 'ts')
