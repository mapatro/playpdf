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
