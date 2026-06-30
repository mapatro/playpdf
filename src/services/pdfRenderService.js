// Client-side PDF page rendering using pdfjs-dist.
//
// The worker is loaded from the bundled pdfjs-dist build via Vite's `?url`
// import. This guarantees NO CDN dependency — important because privacy
// (no third-party requests) is the whole point of this app.

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * Render thumbnails for a PDF.
 *
 * Architecture note: this supports per-page rendering via `maxPages`.
 * The MVP UI only requests the first page of each file to keep things
 * light, but the function can render every page if asked.
 *
 * @param {ArrayBuffer|Uint8Array} data PDF bytes
 * @param {object} [opts]
 * @param {number} [opts.maxPages=1] how many pages to render (from page 1)
 * @param {number} [opts.scale=0.4] render scale
 * @returns {Promise<{ pageCount: number, thumbnails: string[] }>}
 *          thumbnails are data URLs (PNG)
 */
export async function renderThumbnails(data, opts = {}) {
  const { maxPages = 1, scale = 0.4 } = opts

  // pdf.js can detach the buffer it receives; pass a copy so the caller's
  // bytes remain usable (e.g. for the subsequent merge).
  const bytes =
    data instanceof Uint8Array ? data.slice() : new Uint8Array(data).slice()

  const loadingTask = pdfjsLib.getDocument({ data: bytes })
  const pdf = await loadingTask.promise

  const pageCount = pdf.numPages
  const count = Math.min(maxPages, pageCount)
  const thumbnails = []

  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    await page.render({ canvasContext: context, viewport }).promise
    thumbnails.push(canvas.toDataURL('image/png'))
    page.cleanup()
  }

  await pdf.destroy()
  return { pageCount, thumbnails }
}

/**
 * Render every page of a PDF to a JPEG Blob.
 *
 * @param {ArrayBuffer|Uint8Array} data
 * @param {{ scale?: number, quality?: number }} [opts]
 *   scale: render multiplier (default 1.5, ~108 DPI). quality: JPEG quality 0..1 (default 0.85).
 * @returns {Promise<Array<{ name: string, blob: Blob }>>}
 */
export async function renderPagesAsJpeg(data, opts = {}) {
  const { scale = 1.5, quality = 0.85 } = opts
  const bytes =
    data instanceof Uint8Array ? data.slice() : new Uint8Array(data).slice()
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const pageCount = pdf.numPages
  const pad = String(pageCount).length
  const out = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    // Paint a white background — JPEG has no alpha and would otherwise
    // serialize transparent pixels as black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))),
        'image/jpeg',
        quality,
      ),
    )
    out.push({ name: `page-${String(i).padStart(pad, '0')}.jpg`, blob })
    page.cleanup()
  }

  await pdf.destroy()
  return out
}

/**
 * Render every page of a PDF to a PNG data URL — used by the Fill Form
 * workspace, which needs full-resolution pages to overlay editable
 * inputs on top of.
 *
 * @param {ArrayBuffer|Uint8Array} data
 * @param {{ scale?: number }} [opts] scale default 1.25 (~90 DPI, fits comfortably in a workspace column)
 * @returns {Promise<{ pageCount: number, pages: Array<{ dataUrl: string, width: number, height: number }> }>}
 */
export async function renderAllPages(data, opts = {}) {
  const { scale = 1.25 } = opts
  const bytes =
    data instanceof Uint8Array ? data.slice() : new Uint8Array(data).slice()
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const pageCount = pdf.numPages
  const pages = []

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    // The scale-1 viewport gives the page's DISPLAYED size in PDF points
    // (rotation already applied), which is exactly the unit signAndFillPdf
    // bakes text in. Carrying it lets the overlay size text to match the
    // saved output (WYSIWYG) regardless of how big the page is shown.
    const pointViewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: context, viewport }).promise
    pages.push({
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      pointWidth: pointViewport.width,
      pointHeight: pointViewport.height,
    })
    page.cleanup()
  }

  await pdf.destroy()
  return { pageCount, pages }
}
