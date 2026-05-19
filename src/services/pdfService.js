// All PDF processing is done here, 100% in the browser using pdf-lib.
// Nothing in this module performs network I/O. Files never leave the
// user's machine.

import { PDFDocument, degrees } from 'pdf-lib'
import JSZip from 'jszip'

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
 * Extract a 1-based inclusive page range into a new single PDF.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {number} from 1-based first page (inclusive)
 * @param {number} to   1-based last page (inclusive)
 * @returns {Promise<Uint8Array>} the extracted PDF bytes
 */
export async function splitPdfRange(input, from, to) {
  const bytes = await toUint8Array(input)
  const src = await PDFDocument.load(bytes)
  const pageCount = src.getPageCount()

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to < from ||
    to > pageCount
  ) {
    throw new Error(
      `Invalid page range: must satisfy 1 ≤ from ≤ to ≤ ${pageCount} (got from=${from}, to=${to}).`,
    )
  }

  const out = await PDFDocument.create()
  const indices = []
  for (let i = from - 1; i <= to - 1; i++) indices.push(i)
  const pages = await out.copyPages(src, indices)
  pages.forEach((page) => out.addPage(page))
  return out.save()
}

/**
 * Split a PDF into one single-page PDF per page, bundled into a ZIP.
 * Entries are named `page-01.pdf`, `page-02.pdf`, … (zero-padded).
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @returns {Promise<Blob>} a ZIP blob
 */
export async function splitPdfAll(input) {
  const bytes = await toUint8Array(input)
  const src = await PDFDocument.load(bytes)
  const pageCount = src.getPageCount()
  if (pageCount < 1) {
    throw new Error('The PDF has no pages to split.')
  }

  const pad = String(pageCount).length
  const zip = new JSZip()

  for (let i = 0; i < pageCount; i++) {
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(src, [i])
    out.addPage(page)
    const pageBytes = await out.save()
    const name = `page-${String(i + 1).padStart(pad, '0')}.pdf`
    zip.file(name, pageBytes)
  }

  return zip.generateAsync({ type: 'blob' })
}

/**
 * Rotate pages of a PDF. Rotation is ADDITIVE: any existing page rotation
 * is read and the requested angle is added, then normalized to one of
 * 0 / 90 / 180 / 270.
 *
 * Pass either:
 *   - `{ angle: 90|180|270 }` to rotate every page by the same angle, or
 *   - `{ rotations: { [pageIndex0Based]: 90|180|270 } }` for per-page angles.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {{ angle?: number, rotations?: Record<number, number> }} options
 * @returns {Promise<Uint8Array>} the rotated PDF bytes
 */
export async function rotatePdf(input, options = {}) {
  const { angle, rotations } = options
  const bytes = await toUint8Array(input)
  const doc = await PDFDocument.load(bytes)
  const pages = doc.getPages()

  const normalize = (deg) => {
    const n = ((Math.round(deg / 90) * 90) % 360 + 360) % 360
    return n
  }

  if (rotations && typeof rotations === 'object') {
    pages.forEach((page, idx) => {
      const delta = rotations[idx]
      if (!delta) return
      if (delta % 90 !== 0) {
        throw new Error('Rotation angles must be multiples of 90.')
      }
      const current = page.getRotation().angle || 0
      page.setRotation(degrees(normalize(current + delta)))
    })
    return doc.save()
  }

  if (typeof angle === 'number') {
    if (angle % 90 !== 0) {
      throw new Error('Rotation angle must be a multiple of 90.')
    }
    pages.forEach((page) => {
      const current = page.getRotation().angle || 0
      page.setRotation(degrees(normalize(current + angle)))
    })
    return doc.save()
  }

  throw new Error('rotatePdf requires either an angle or a rotations map.')
}

/**
 * Reorder pages within a PDF. `newOrder` is an array of original 0-based
 * page indices and must be a true permutation covering every page exactly
 * once.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {number[]} newOrder original 0-based indices in their new order
 * @returns {Promise<Uint8Array>} the reordered PDF bytes
 */
export async function reorderPages(input, newOrder) {
  const bytes = await toUint8Array(input)
  const src = await PDFDocument.load(bytes)
  const pageCount = src.getPageCount()

  if (!Array.isArray(newOrder) || newOrder.length !== pageCount) {
    throw new Error(
      `Invalid order: expected a permutation of ${pageCount} page indices.`,
    )
  }
  const seen = new Set()
  for (const idx of newOrder) {
    if (
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= pageCount ||
      seen.has(idx)
    ) {
      throw new Error(
        `Invalid order: must be a permutation of 0…${pageCount - 1} with no repeats.`,
      )
    }
    seen.add(idx)
  }

  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, newOrder)
  pages.forEach((page) => out.addPage(page))
  return out.save()
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
