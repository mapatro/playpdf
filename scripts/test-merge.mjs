// Lightweight, dependency-light test for the merge logic.
//
// We import the pure pdf-lib merge implementation directly. pdfService.js
// also imports the browser-only `downloadBlob`, but `mergePdfs` itself is
// environment-agnostic, so importing the module under Node works (the
// download helper is just never called here).
//
// Run: npm run test:merge   (or: node scripts/test-merge.mjs)

import { PDFDocument } from 'pdf-lib'
import { mergePdfs } from '../src/services/pdfService.js'

async function makePdf(pageCount) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400])
    page.drawText(`Test page ${i + 1}`, { x: 40, y: 350, size: 18 })
  }
  return doc.save()
}

async function main() {
  const pdfA = await makePdf(3) // 3 pages
  const pdfB = await makePdf(2) // 2 pages
  const expected = 3 + 2

  const mergedBytes = await mergePdfs([pdfA, pdfB])
  const merged = await PDFDocument.load(mergedBytes)
  const actual = merged.getPageCount()

  if (actual !== expected) {
    console.error(
      `FAIL: expected merged page count ${expected}, got ${actual}`,
    )
    process.exit(1)
  }

  // Also assert the merge rejects fewer than 2 inputs.
  let rejected = false
  try {
    await mergePdfs([pdfA])
  } catch {
    rejected = true
  }
  if (!rejected) {
    console.error('FAIL: mergePdfs should reject fewer than 2 inputs')
    process.exit(1)
  }

  console.log(
    `PASS: merged ${expected} pages correctly (3 + 2); guard rejects <2 inputs.`,
  )
}

main().catch((err) => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})
