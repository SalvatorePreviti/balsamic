import fs from 'fs'

const aaa = 123

let www = 0

export function xxx() {
  console.log('xxx', aaa, www, import.meta.url, fs.unlink, new Error('xxx').stack)
  www += 1
}

export { www }
