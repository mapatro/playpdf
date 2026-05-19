// All PDF processing is done here, 100% in the browser using pdf-lib.
// Nothing in this module performs network I/O. Files never leave the
// user's machine.

import { PDFDocument, degrees } from 'pdf-lib'

/**
 * Merge multiple PDFs into a single PDF, in the given order.
 *
 * Accepts an array of inputs where each input is one of:
 *   - ArrayBuffer / Uint8Array of the PDF bytes
 *   - a File / Blob (will be read via arrayBuffer())
 *
 * @param {Array<ArrayBuffer|Uint8Array|Blob|File>} inputs
 * @returns {Promise<Uint8Array>} the merged PDF bytes
 */
export async function mergePdfs(inputs) {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error('mergePdfs requires at least 2 PDF inputs.')
  }

  const merged = await PDFDocument.create()

  for (const input of inputs) {
    const bytes = await toUint8Array(input)
    const src = await PDFDocument.load(bytes)
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((page) => merged.addPage(page))
  }

  return merged.save()
}

/**
 * STUB — Split a PDF into multiple documents.
 * Not yet implemented (MVP only ships Merge).
 * @param {ArrayBuffer|Uint8Array|Blob|File} _input
 * @param {object} _options
 * @returns {Promise<Uint8Array[]>}
 */
export async function splitPdf(_input, _options) {
  throw new Error('splitPdf is not implemented yet (coming soon).')
}

/**
 * STUB — Rotate pages of a PDF.
 * Not yet implemented (MVP only ships Merge).
 * The `degrees` helper from pdf-lib is imported and ready for use here.
 * @param {ArrayBuffer|Uint8Array|Blob|File} _input
 * @param {object} _options
 * @returns {Promise<Uint8Array>}
 */
export async function rotatePdf(_input, _options) {
  void degrees // referenced so the import is ready for the real implementation
  throw new Error('rotatePdf is not implemented yet (coming soon).')
}

/**
 * STUB — Reorder pages within a PDF.
 * Not yet implemented (MVP only ships Merge).
 * @param {ArrayBuffer|Uint8Array|Blob|File} _input
 * @param {number[]} _newOrder
 * @returns {Promise<Uint8Array>}
 */
export async function reorderPages(_input, _newOrder) {
  throw new Error('reorderPages is not implemented yet (coming soon).')
}

/**
 * Trigger a browser download of bytes as a file. Uses an object URL that
 * is revoked afterwards. Nothing is uploaded.
 * @param {Uint8Array|Blob} data
 * @param {string} filename
 */
export function downloadBlob(data, filename) {
  const blob =
    data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revocation so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function toUint8Array(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer())
  }
  throw new Error('Unsupported PDF input type.')
}
