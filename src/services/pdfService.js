// All PDF processing is done here, 100% in the browser using pdf-lib.
// Nothing in this module performs network I/O. Files never leave the
// user's machine.

import {
  PDFDocument,
  PDFName,
  degrees,
  rgb,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  PDFButton,
} from 'pdf-lib'
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
 * Inspect a PDF for AcroForm fields. Returns `null` if no AcroForm is
 * present, otherwise an array of widget records — one per field
 * appearance on a page (a single named field can appear on multiple
 * pages, e.g. an initials field).
 *
 * Each record:
 *   { name, type, value, options?, page, x, y, width, height }
 *
 * `type` is one of:
 *   'text' | 'checkbox' | 'radio' | 'dropdown' | 'listbox'
 *   | 'signature' | 'button'
 *
 * x/y/width/height are normalized to [0,1] in the page's TOP-LEFT origin
 * coordinate space (so the UI can position inputs identically to other
 * operations like Redact / Sign).
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 */
export async function inspectForm(input) {
  const bytes = await toUint8Array(input)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })

  let form
  try {
    form = doc.getForm()
  } catch {
    return null
  }
  const fields = form.getFields()
  if (!fields || fields.length === 0) return null

  const pages = doc.getPages()
  const pageIndexByRefTag = new Map()
  pages.forEach((p, i) => pageIndexByRefTag.set(p.ref.tag, i))

  // Helper: find which page a widget sits on. Tries the widget's P entry
  // first, falls back to scanning each page's Annots for a matching ref.
  const findPageIndex = (widget) => {
    try {
      const pageRef = widget.dict?.get?.(PDFName.of('P'))
      if (pageRef && pageRef.tag && pageIndexByRefTag.has(pageRef.tag)) {
        return pageIndexByRefTag.get(pageRef.tag)
      }
    } catch {}
    for (let i = 0; i < pages.length; i++) {
      try {
        const annots = pages[i].node.Annots()
        if (!annots) continue
        const arr = annots.asArray ? annots.asArray() : []
        for (const a of arr) {
          const resolved = doc.context.lookup(a)
          if (resolved === widget.dict) return i
        }
      } catch {}
    }
    return -1
  }

  const records = []
  for (const field of fields) {
    const name = field.getName()
    const type = inferFieldType(field)
    const value = readFieldValue(field, type)
    const options = readFieldOptions(field, type)
    let widgets = []
    try {
      widgets = field.acroField.getWidgets() || []
    } catch {
      widgets = []
    }
    for (const widget of widgets) {
      let rect
      try {
        rect = widget.getRectangle()
      } catch {
        continue
      }
      const pageIdx = findPageIndex(widget)
      if (pageIdx < 0) continue
      const page = pages[pageIdx]
      const pw = page.getWidth()
      const ph = page.getHeight()
      records.push({
        name,
        type,
        value,
        options,
        page: pageIdx,
        x: rect.x / pw,
        // Flip Y from PDF bottom-left to UI top-left.
        y: (ph - rect.y - rect.height) / ph,
        width: rect.width / pw,
        height: rect.height / ph,
      })
    }
  }
  return records
}

function inferFieldType(field) {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFOptionList) return 'listbox'
  if (field instanceof PDFSignature) return 'signature'
  if (field instanceof PDFButton) return 'button'
  return 'text'
}

function readFieldValue(field, type) {
  try {
    if (type === 'text') return field.getText() ?? ''
    if (type === 'checkbox') return field.isChecked()
    if (type === 'radio') return field.getSelected() ?? null
    if (type === 'dropdown') return field.getSelected()?.[0] ?? null
    if (type === 'listbox') return field.getSelected() ?? []
  } catch {}
  return null
}

function readFieldOptions(field, type) {
  try {
    if (type === 'radio') return field.getOptions() ?? []
    if (type === 'dropdown' || type === 'listbox')
      return field.getOptions() ?? []
  } catch {}
  return undefined
}

/**
 * Fill AcroForm fields with the given values. `valuesByName` keys are
 * the field names returned by inspectForm(). For checkboxes a truthy
 * value checks, falsy unchecks. For radios/dropdowns the value is the
 * option string to select. For listboxes pass an array.
 *
 * If `flatten` is true the fields are flattened after filling — values
 * become permanent ink and the form is no longer interactive.
 *
 * @param {ArrayBuffer|Uint8Array|Blob|File} input
 * @param {Record<string, any>} valuesByName
 * @param {{ flatten?: boolean }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fillFormFields(input, valuesByName, opts = {}) {
  const { flatten = false } = opts
  if (!valuesByName || typeof valuesByName !== 'object') {
    throw new Error('fillFormFields requires a values-by-name map.')
  }
  const bytes = await toUint8Array(input)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  let filled = 0

  for (const [name, raw] of Object.entries(valuesByName)) {
    let field
    try {
      field = form.getField(name)
    } catch {
      continue
    }
    if (!field) continue
    const type = inferFieldType(field)

    try {
      if (type === 'text') {
        field.setText(raw == null ? '' : String(raw))
        filled += 1
      } else if (type === 'checkbox') {
        if (raw) field.check()
        else field.uncheck()
        filled += 1
      } else if (type === 'radio') {
        if (raw != null && raw !== '') {
          field.select(String(raw))
          filled += 1
        }
      } else if (type === 'dropdown') {
        if (raw != null && raw !== '') {
          field.select(String(raw))
          filled += 1
        }
      } else if (type === 'listbox') {
        if (Array.isArray(raw)) {
          field.select(raw.map(String))
          filled += 1
        } else if (raw != null && raw !== '') {
          field.select(String(raw))
          filled += 1
        }
      }
      // signature and button intentionally ignored.
    } catch (err) {
      // Skip fields that can't accept the given value (e.g. invalid option).
      // Keep going so one bad field doesn't fail the whole submission.
      // eslint-disable-next-line no-console
      console.warn(`Could not fill field "${name}":`, err?.message)
    }
  }

  if (filled === 0) {
    throw new Error('No form fields were filled.')
  }

  try {
    form.updateFieldAppearances()
  } catch {}
  if (flatten) {
    try {
      form.flatten()
    } catch {}
  }

  return doc.save()
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
    // mbW/mbH are the unrotated MediaBox dimensions — what pdf-lib's
    // drawText/drawImage operate in. dispW/dispH are what the viewer
    // shows after applying the page's Rotate parameter — what the
    // workspace clicks are normalized to.
    const mbW = page.getWidth()
    const mbH = page.getHeight()
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const portraitFlip = rotation === 90 || rotation === 270
    const dispW = portraitFlip ? mbH : mbW
    const dispH = portraitFlip ? mbW : mbH

    for (const item of items) {
      // Normalized [0,1] coords from the workspace are in DISPLAYED
      // (viewer-rotated) page space, top-left origin. Convert to the
      // viewer's bottom-left "display" coords first…
      const nx = clamp01(item.x)
      const ny = clamp01(item.y)
      const xDisp = nx * dispW
      const yDispFromTopAnchor = ny * dispH // top of the placement

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
        const sigW = clamp01(item.width) * dispW
        const sigH = sigW / aspect
        // The image's anchor in pdf-lib's drawImage is its bottom-left
        // corner. In display coords, that means y_from_bottom of the
        // top edge minus the image height.
        const yDispBL = dispH - yDispFromTopAnchor - sigH
        const draw = displayToMediaBox(
          xDisp,
          yDispBL,
          sigW,
          sigH,
          rotation,
          mbW,
          mbH,
        )
        page.drawImage(embedded, {
          x: draw.x,
          y: draw.y,
          width: sigW,
          height: sigH,
          rotate: degrees(rotation),
        })
        total += 1
      } else if (item.kind === 'text') {
        const fontSize = Number(item.fontSize) || 12
        const text = String(item.text ?? '')
        if (!text) continue
        // pdf-lib's drawText anchor is the BASELINE (bottom-left of
        // the glyph baseline). Place the baseline one fontSize below
        // the placement's top edge in display coords.
        const yDispBaseline = dispH - yDispFromTopAnchor - fontSize
        // For the baseline anchor we pass zero "box" dimensions —
        // displayToMediaBox only needs them for the rotated image-
        // corner translation, not for text.
        const draw = displayToMediaBox(
          xDisp,
          yDispBaseline,
          0,
          0,
          rotation,
          mbW,
          mbH,
        )
        page.drawText(text, {
          x: draw.x,
          y: draw.y,
          size: fontSize,
          color: rgb(0, 0, 0),
          rotate: degrees(rotation),
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
 * Convert a display-space anchor point (bottom-left of the placement,
 * y from bottom) to the MediaBox-space anchor that pdf-lib needs so
 * the rendered glyph/image lands at that display position after the
 * viewer applies the page's Rotate parameter.
 *
 * For rotated pages, drawing a text/image at MediaBox(x,y) without
 * matching the rotation makes it appear at the wrong spot AND
 * sideways. Callers MUST also pass `rotate: degrees(rotation)` to
 * drawText / drawImage to spin the glyph back upright.
 *
 * boxW/boxH are the placement's width/height in display coords; they
 * matter for image rotation pivot — for text (point anchor) pass 0/0.
 */
function displayToMediaBox(xD, yD, boxW, boxH, rotation, mbW, mbH) {
  // The transform is the rotation matrix applied to the bottom-left
  // anchor, plus a translation that compensates for where the rotated
  // bounding box would otherwise land outside the page.
  switch (rotation) {
    case 0:
      return { x: xD, y: yD }
    case 90:
      // Display = MediaBox rotated 90° CW. After we apply rotate:90 to
      // a horizontal element, its bottom-left in MB lands at where its
      // ORIGINAL bottom-left should be when the page is shown. From
      // experimentation: place the anchor at (mbW - yD - boxH? no —
      // for a rotated text/image, pdf-lib's `rotate` spins around the
      // (x,y) anchor itself, so we just remap the anchor.)
      // After rotate:90 CW about anchor, the element extends LEFT and
      // UP in MB space. We want it to end up at display (xD, yD) with
      // boxW going right and boxH going up in DISPLAY. So:
      //   anchor_MB.x = mbW - yD
      //   anchor_MB.y = xD
      return { x: mbW - yD, y: xD }
    case 180:
      // Page flipped. After rotate:180 around anchor, element extends
      // LEFT and DOWN. Anchor should be at the OPPOSITE corner.
      return { x: mbW - xD, y: mbH - yD }
    case 270:
      // Most common rotated-PDF case (lots of forms are saved as
      // landscape pages with Rotate:270 so they display as portrait).
      // After rotate:270 about anchor, element extends RIGHT and DOWN
      // in MB. We want the visible bottom-left in display = (xD, yD).
      //   anchor_MB.x = yD
      //   anchor_MB.y = mbH - xD
      return { x: yD, y: mbH - xD }
    default:
      // Non-multiple-of-90 rotations are very rare; treat as 0 and
      // accept the offset rather than crashing.
      return { x: xD, y: yD }
  }
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
