// File System Access API wrapper.
//
// On Chromium browsers we can open files with a handle and later write
// back to the same path — no download, no rename, just "Save". On
// Firefox/Safari we don't get a handle and fall back to download. The
// rest of the app should treat `fileHandle: null` as "no handle path"
// and the helper saveOrDownload picks the right behavior automatically.

import { downloadBlob } from './pdfService.js'

export function isFileSystemAccessSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function'
  )
}

/**
 * Open one or more PDFs via the File System Access picker, returning
 * each as { file, fileHandle }. Throws AbortError if the user cancels.
 * Callers should catch that and treat it as a no-op.
 */
export async function openPdfFiles({ multiple = true } = {}) {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API not supported in this browser.')
  }
  const handles = await window.showOpenFilePicker({
    multiple,
    types: [
      {
        description: 'PDF',
        accept: { 'application/pdf': ['.pdf'] },
      },
    ],
    excludeAcceptAllOption: false,
  })
  const out = []
  for (const fileHandle of handles) {
    const file = await fileHandle.getFile()
    out.push({ file, fileHandle })
  }
  return out
}

/**
 * Write bytes back to a FileSystemFileHandle. Asks for read-write
 * permission if not already granted.
 *
 * @param {FileSystemFileHandle} fileHandle
 * @param {Uint8Array | Blob} bytes
 */
export async function saveBytesToHandle(fileHandle, bytes) {
  if (!fileHandle) throw new Error('No file handle.')
  // requestPermission is required in some flows (e.g. handle persisted
  // across sessions). For a freshly opened handle this is usually a
  // no-op and returns 'granted'.
  if (typeof fileHandle.requestPermission === 'function') {
    const perm = await fileHandle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      const err = new Error('Permission denied.')
      err.name = 'NotAllowedError'
      throw err
    }
  }
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(bytes)
  } finally {
    await writable.close()
  }
}

/**
 * Save bytes to the file's handle if one is present; otherwise trigger
 * a normal browser download.
 *
 * @param {{ fileHandle?: FileSystemFileHandle | null, bytes: Uint8Array | Blob, fallbackName: string }} args
 * @returns {Promise<{ savedInPlace: boolean }>}
 */
export async function saveOrDownload({ fileHandle, bytes, fallbackName }) {
  if (fileHandle) {
    await saveBytesToHandle(fileHandle, bytes)
    return { savedInPlace: true }
  }
  downloadBlob(bytes, fallbackName)
  return { savedInPlace: false }
}

/**
 * "Save As" — always asks the user where to write a new file. Uses
 * showSaveFilePicker on Chromium (and returns the resulting handle so
 * the caller can switch to in-place saving thereafter). Falls back to
 * a regular download on browsers without the API.
 *
 * Throws AbortError if the user cancels the picker — callers should
 * catch and treat as a no-op.
 *
 * @param {{ bytes: Uint8Array | Blob, suggestedName: string }} args
 * @returns {Promise<{ savedInPlace: boolean, fileHandle: FileSystemFileHandle | null }>}
 */
export async function saveAsPdf({ bytes, suggestedName }) {
  if (
    typeof window === 'undefined' ||
    typeof window.showSaveFilePicker !== 'function'
  ) {
    downloadBlob(bytes, suggestedName)
    return { savedInPlace: false, fileHandle: null }
  }
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'PDF',
        accept: { 'application/pdf': ['.pdf'] },
      },
    ],
  })
  await saveBytesToHandle(handle, bytes)
  return { savedInPlace: true, fileHandle: handle }
}
