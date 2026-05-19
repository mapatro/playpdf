// Dependency-light tests for the reorder logic.
//
// Each page is sized distinctly (width = 100 + index*10) so we can verify
// the page ORDER actually changed by reading page sizes back via pdf-lib.
//
// Run: npm run test:reorder   (or: node scripts/test-reorder.mjs)

import { PDFDocument } from 'pdf-lib'
import { reorderPages } from '../src/services/pdfService.js'

async function makePdf(pageCount) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    // Distinguishable page size: width encodes original index.
    const width = 100 + i * 10
    const page = doc.addPage([width, 400])
    page.drawText(`Original page ${i + 1}`, { x: 10, y: 350, size: 12 })
  }
  return doc.save()
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  // 1. 4-page doc reordered [3,2,1,0] → reversed.
  const pdf4 = await makePdf(4)
  const reordered = await reorderPages(pdf4, [3, 2, 1, 0])
  const doc = await PDFDocument.load(reordered)
  if (doc.getPageCount() !== 4) {
    fail(`reorder expected 4 pages, got ${doc.getPageCount()}`)
  }
  // Original widths: [100,110,120,130]. Reversed → [130,120,110,100].
  const widths = doc.getPages().map((p) => Math.round(p.getWidth()))
  const expected = [130, 120, 110, 100]
  if (JSON.stringify(widths) !== JSON.stringify(expected)) {
    fail(`reorder page order wrong: expected widths ${expected}, got ${widths}`)
  }

  // 2. Non-permutation [0,0,1,2] is rejected.
  let threw = false
  try {
    await reorderPages(pdf4, [0, 0, 1, 2])
  } catch {
    threw = true
  }
  if (!threw) fail('reorderPages should reject a non-permutation [0,0,1,2]')

  // 3. Wrong-length array is rejected.
  threw = false
  try {
    await reorderPages(pdf4, [0, 1, 2])
  } catch {
    threw = true
  }
  if (!threw) fail('reorderPages should reject a wrong-length order')

  // 4. Out-of-range index is rejected.
  threw = false
  try {
    await reorderPages(pdf4, [0, 1, 2, 9])
  } catch {
    threw = true
  }
  if (!threw) fail('reorderPages should reject an out-of-range index')

  console.log(
    'PASS: reorder [3,2,1,0] reverses pages (verified by width); non-permutation, wrong-length & out-of-range rejected.',
  )
}

main().catch((err) => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})
