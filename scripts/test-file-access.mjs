// Tests the File System Access wrapper. We can't actually use the
// browser API from Node, but we can mock a FileSystemFileHandle and
// confirm the dispatch logic in saveOrDownload picks the right path.

import {
  isFileSystemAccessSupported,
  saveBytesToHandle,
  saveOrDownload,
} from '../src/services/fileAccess.js'

let failed = 0
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label}${detail ? `\n    ${detail}` : ''}`)
  }
}

// 1) Node has no window.showOpenFilePicker.
check(
  'isFileSystemAccessSupported() returns false in Node',
  isFileSystemAccessSupported() === false,
)

// 2) saveBytesToHandle uses createWritable + write + close, in order.
{
  let writeCalled = false
  let closeCalled = false
  let writtenBytes = null
  const order = []
  const writable = {
    write: async (b) => {
      writeCalled = true
      writtenBytes = b
      order.push('write')
    },
    close: async () => {
      closeCalled = true
      order.push('close')
    },
  }
  const handle = {
    requestPermission: async () => 'granted',
    createWritable: async () => {
      order.push('createWritable')
      return writable
    },
  }
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"
  await saveBytesToHandle(handle, bytes)
  check(
    'saveBytesToHandle writes via createWritable',
    writeCalled && closeCalled && writtenBytes === bytes,
  )
  check(
    'saveBytesToHandle calls createWritable → write → close in order',
    order.join('|') === 'createWritable|write|close',
    `got: ${order.join('|')}`,
  )
}

// 3) saveBytesToHandle throws NotAllowedError on permission denial.
{
  const handle = {
    requestPermission: async () => 'denied',
    createWritable: async () => {
      throw new Error('should not reach createWritable')
    },
  }
  let err = null
  try {
    await saveBytesToHandle(handle, new Uint8Array([0]))
  } catch (e) {
    err = e
  }
  check(
    'saveBytesToHandle throws NotAllowedError on permission denial',
    err && err.name === 'NotAllowedError',
    err ? `name=${err.name}` : 'no error thrown',
  )
}

// 4) saveOrDownload with a handle: savedInPlace=true, handle used.
{
  let createWritableCalled = false
  const writable = { write: async () => {}, close: async () => {} }
  const handle = {
    requestPermission: async () => 'granted',
    createWritable: async () => {
      createWritableCalled = true
      return writable
    },
  }
  const out = await saveOrDownload({
    fileHandle: handle,
    bytes: new Uint8Array([1]),
    fallbackName: 'x.pdf',
  })
  check(
    'saveOrDownload with handle → savedInPlace=true and uses handle',
    out.savedInPlace === true && createWritableCalled,
  )
}

// 5) saveOrDownload without a handle: falls back to downloadBlob (stubbed).
//    downloadBlob touches URL + document; stub both, then restore.
{
  let urlCreated = false
  let anchorClicked = false
  const prevURL = globalThis.URL
  const prevDocument = globalThis.document

  // Keep URL.* but override createObjectURL/revokeObjectURL for the call.
  const URLStub = Object.assign(Object.create(prevURL || {}), {
    createObjectURL: () => {
      urlCreated = true
      return 'blob:test'
    },
    revokeObjectURL: () => {},
  })
  globalThis.URL = URLStub

  globalThis.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        href: '',
        download: '',
        click() {
          anchorClicked = true
        },
        remove() {},
      }
    },
  }

  try {
    const out = await saveOrDownload({
      fileHandle: null,
      bytes: new Uint8Array([1]),
      fallbackName: 'x.pdf',
    })
    check(
      'saveOrDownload without handle → savedInPlace=false and downloads',
      out.savedInPlace === false && urlCreated && anchorClicked,
    )
  } finally {
    globalThis.URL = prevURL
    if (prevDocument === undefined) delete globalThis.document
    else globalThis.document = prevDocument
  }
}

if (failed > 0) {
  console.error(`\nFAIL: ${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nPASS: file-access save dispatch (5 checks).')

// downloadBlob schedules a 1s setTimeout to revoke the URL — let the
// process exit cleanly without waiting on that timer.
process.exit(0)
