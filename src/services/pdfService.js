// All PDF processing is done here, 100% in the browser using pdf-lib.
// Nothing in this module performs network I/O. Files never leave the
// user's machine.

import { PDFDocument, degrees, rgb } from 'pdf-lib'
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
 * Remove the given 0-based page indices from a PDF, returning a new PDF
 * with the remaining pages in their original order.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {number[]} indicesToRemove 0-based page indices to remove
 * @returns {Promise<Uint8Array>} the trimmed PDF bytes
 */
export async function deletePages(input, indicesToRemove) {
  const bytes = await toUint8Array(input)
  const src = await PDFDocument.load(bytes)
  const pageCount = src.getPageCount()

  if (!Array.isArray(indicesToRemove)) {
    throw new Error('deletePages requires an array of indices.')
  }
  const remove = new Set()
  for (const idx of indicesToRemove) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= pageCount) {
      throw new Error(
        `Invalid page index ${idx}: must be 0…${pageCount - 1}.`,
      )
    }
    remove.add(idx)
  }
  if (remove.size === 0) {
    throw new Error('No pages selected for deletion.')
  }
  if (remove.size === pageCount) {
    throw new Error('Refusing to delete every page of the PDF.')
  }

  const keep = []
  for (let i = 0; i < pageCount; i++) if (!remove.has(i)) keep.push(i)

  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, keep)
  pages.forEach((page) => out.addPage(page))
  return out.save()
}

/**
 * Apply signature images and free-text annotations to a PDF.
 *
 * Each placement is normalized to [0,1] of the page in TOP-LEFT-origin
 * space; widths/heights for signatures are fractions of page width;
 * text size is in PDF points.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {Record<number, Array<
 *   { kind: 'sig', x: number, y: number, width: number, png: Uint8Array }
 *   | { kind: 'text', x: number, y: number, text: string, fontSize: number }
 * >>} placements
 * @returns {Promise<Uint8Array>} the annotated PDF bytes
 */
export async function signAndFillPdf(input, placements) {
  if (!placements || typeof placements !== 'object') {
    throw new Error('signAndFillPdf requires a placements map.')
  }
  const bytes = await toUint8Array(input)
  const doc = await PDFDocument.load(bytes)
  const pages = doc.getPages()
  // Cache embedded PNGs so we don't re-embed the same signature N times.
  const sigCache = new Map()
  let total = 0

  for (const [key, items] of Object.entries(placements)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= pages.length) {
      throw new Error(`Invalid page index ${key}.`)
    }
    if (!Array.isArray(items) || items.length === 0) continue
    const page = pages[idx]
    const w = page.getWidth()
    const h = page.getHeight()

    for (const item of items) {
      if (item.kind === 'sig') {
        if (!(item.png instanceof Uint8Array)) {
          throw new Error('Signature item is missing PNG bytes.')
        }
        let embedded = sigCache.get(item.png)
        if (!embedded) {
          embedded = await doc.embedPng(item.png)
          sigCache.set(item.png, embedded)
        }
        const aspect = embedded.width / embedded.height
        const sigW = clamp01(item.width) * w
        const sigH = sigW / aspect
        page.drawImage(embedded, {
          x: clamp01(item.x) * w,
          y: h - clamp01(item.y) * h - sigH,
          width: sigW,
          height: sigH,
        })
        total += 1
      } else if (item.kind === 'text') {
        const fontSize = Number(item.fontSize) || 12
        const text = String(item.text ?? '')
        if (!text) continue
        page.drawText(text, {
          x: clamp01(item.x) * w,
          // pdf-lib text uses baseline at y; we anchor at top-left, so
          // shift down by one font size.
          y: h - clamp01(item.y) * h - fontSize,
          size: fontSize,
          color: rgb(0, 0, 0),
        })
        total += 1
      } else {
        throw new Error(`Unknown placement kind: ${item.kind}`)
      }
    }
  }

  if (total === 0) throw new Error('No signature or text placements given.')
  return doc.save()
}

/**
 * Visually redact rectangular regions on PDF pages by drawing opaque
 * black rectangles over them.
 *
 * Note: this is VISUAL redaction — any underlying text/objects are still
 * present in the file and recoverable. For irreversible redaction,
 * pair it with the PDF → JPG export.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {Record<number, Array<{x:number,y:number,width:number,height:number}>>} rectsByPage
 *   Keyed by 0-based page index. Each rect is normalized to [0,1] in
 *   the page's coordinate space with the origin at the TOP-LEFT.
 * @returns {Promise<Uint8Array>} the redacted PDF bytes
 */
export async function redactPdf(input, rectsByPage) {
  if (!rectsByPage || typeof rectsByPage !== 'object') {
    throw new Error('redactPdf requires a rectsByPage map.')
  }
  const bytes = await toUint8Array(input)
  const doc = await PDFDocument.load(bytes)
  const pages = doc.getPages()

  let total = 0
  for (const [key, rects] of Object.entries(rectsByPage)) {
    const idx = Number(key)
    if (!Number.isInteger(idx) || idx < 0 || idx >= pages.length) {
      throw new Error(`Invalid page index ${key}.`)
    }
    if (!Array.isArray(rects) || rects.length === 0) continue
    const page = pages[idx]
    const w = page.getWidth()
    const h = page.getHeight()
    for (const r of rects) {
      const rx = clamp01(r.x)
      const ry = clamp01(r.y)
      const rw = clamp01(r.width)
      const rh = clamp01(r.height)
      if (rw <= 0 || rh <= 0) continue
      page.drawRectangle({
        x: rx * w,
        // Flip Y: input is top-left origin, pdf-lib is bottom-left.
        y: h - (ry + rh) * h,
        width: rw * w,
        height: rh * h,
        color: rgb(0, 0, 0),
        opacity: 1,
      })
      total += 1
    }
  }

  if (total === 0) throw new Error('No redaction rectangles given.')
  return doc.save()
}

function clamp01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

/**
 * Build a new PDF from an ordered list of images (JPG / PNG). Each image
 * becomes its own page sized to the image's natural dimensions.
 *
 * @param {Array<Blob|File|ArrayBuffer|Uint8Array>} images
 * @returns {Promise<Uint8Array>} the PDF bytes
 */
export async function imagesToPdf(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('imagesToPdf requires at least one image.')
  }
  const doc = await PDFDocument.create()
  for (const img of images) {
    const bytes = await toUint8Array(img)
    const kind = detectImageType(bytes)
    let embedded
    if (kind === 'jpeg') embedded = await doc.embedJpg(bytes)
    else if (kind === 'png') embedded = await doc.embedPng(bytes)
    else
      throw new Error(
        'Unsupported image type. Only JPG and PNG are supported.',
      )
    const page = doc.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: embedded.width,
      height: embedded.height,
    })
  }
  return doc.save()
}

/** Sniff JPEG / PNG by magic bytes. Returns 'jpeg' | 'png' | 'unknown'. */
function detectImageType(bytes) {
  if (bytes.length < 8) return 'unknown'
  // JPEG: starts FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'png'
  return 'unknown'
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
