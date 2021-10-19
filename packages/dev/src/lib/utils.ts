import path from 'path'

export const initialCwd = process.cwd()

const _timeUnits = [
  { unit: 'y', amount: 60 * 60 * 24 * 365.25 },
  { unit: 'd', amount: 60 * 60 * 24 },
  { unit: 'h', amount: 60 * 60 },
  { unit: 'm', amount: 60 },
  { unit: 's', amount: 1 },
  { unit: 'ms', amount: 1 / 1000 }
]

export function millisecondsToString(milliseconds: number | string | readonly [number, number]) {
  if (Array.isArray(milliseconds)) {
    milliseconds = (milliseconds[0] * 1e9 + (milliseconds[1] || 0)) * 1e-6
  }
  milliseconds = +milliseconds
  if (!Number.isFinite(milliseconds)) {
    return `${milliseconds}`
  }
  let str = ''
  const isNegative = milliseconds < 0
  let n = (isNegative ? -milliseconds : milliseconds) / 1000
  for (const { unit, amount } of _timeUnits) {
    const v =
      unit === 'ms'
        ? milliseconds > 500
          ? Math.round(n / amount)
          : Math.round((n / amount) * 100) / 100
        : Math.floor(n / amount)
    if (v) {
      str += `${v}${unit} `
    }
    n -= v * amount
  }
  return str.length > 0 ? (isNegative ? '-' : '') + str.trim() : `0ms`
}

/**
 * Starts measuring time. Returns a function that when called gets the number of elapsed milliseconds.
 * Calling toString on the result will get a prettyfied elapsed time string.
 */
export function startMeasureTime() {
  const startTime = process.hrtime()
  const elapsedMilliseconds = () => {
    const diff = process.hrtime(startTime)
    return (diff[0] * 1e9 + diff[1]) * 1e-6
  }
  elapsedMilliseconds.toString = () => millisecondsToString(process.hrtime(startTime))
  return elapsedMilliseconds
}

/** Makes a path relative and nicely printable */
export function makePathRelative(filePath: string | null | undefined, cwd?: string) {
  if (!filePath) {
    return './'
  }
  if (!cwd || cwd === '.' || cwd === './') {
    cwd = process.cwd()
  }
  if (filePath.indexOf('\\') >= 0 || cwd.indexOf('\\') >= 0) {
    return filePath // avoid doing this on windows
  }
  try {
    const relativePath = path.posix.normalize(path.posix.relative(cwd, filePath))
    return relativePath && relativePath.length < filePath.length ? relativePath : filePath
  } catch (_) {
    return filePath
  }
}

/** Gets the length of an UTF8 string */
export function utf8ByteLength(b: number | string | Buffer | Uint8Array | null | undefined): number {
  return b === null || b === undefined
    ? 0
    : typeof b === 'number'
    ? b || 0
    : typeof b === 'string'
    ? Buffer.byteLength(b, 'utf8')
    : b.length
}

/** Gets a size in bytes in an human readable form. */
export function prettySize(
  bytes: number | string | Buffer | Uint8Array | null | undefined,
  options?: { appendBytes?: boolean; fileType?: string | null }
) {
  if (bytes === null || bytes === undefined) {
    bytes = 0
  }
  const appendBytes = !options || options.appendBytes === undefined || options.appendBytes
  if (typeof bytes === 'object' || typeof bytes === 'string') {
    bytes = utf8ByteLength(bytes)
  }
  bytes = bytes < 0 ? Math.floor(bytes) : Math.ceil(bytes)
  let s
  if (!isFinite(bytes) || bytes < 1024) {
    s = `${bytes} ${appendBytes ? 'Bytes' : 'B'}`
  } else {
    const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), 6)
    s = `${+(bytes / 1024 ** i).toFixed(2)} ${i ? ' kMGTPE'[i] : ''}`
    if (appendBytes) {
      s += `, ${bytes} Bytes`
    }
  }
  if (options && options.fileType) {
    s = `${options.fileType} ${s}`
  }
  return s
}

/** Makes an utf8 string. Removes UTF8 BOM header if present. */
export function toUTF8(text: string | Buffer | Uint8Array | null | undefined | boolean) {
  if (text === null || text === undefined) {
    return ''
  }
  if (typeof text === 'string') {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  }
  if (typeof text === 'boolean' || typeof text === 'number') {
    return text.toString()
  }
  if (!Buffer.isBuffer(text)) {
    text = Buffer.from(text)
  }
  return (text[0] === 0xfe && text[1] === 0xff) || (text[0] === 0xff && text[1] === 0xfe)
    ? text.toString('utf8', 2)
    : text.toString()
}
