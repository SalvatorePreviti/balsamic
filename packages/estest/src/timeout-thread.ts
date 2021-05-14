/* const { parentPort, Worker, isMainThread } = require('worker_threads')

if (isMainThread) {
  const worker = new Worker(__filename)

  const i = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (const x of i) {
    worker.postMessage({ idx: x })
  }
} else {
  parentPort.on('message', async (value) => {
    await testAsync(value)
  })
}

async function testAsync(value) {
  return new Promise((resolve) => {
    console.log(`Starting wait for ${value.idx}`)
    setTimeout(() => {
      console.log(`Complete resolve for ${value.idx}`)
      resolve()

      if (value.idx == 9) {
        setTimeout(() => process.exit(0), 2000)
      }
    }, 500)
  })
}
*/
