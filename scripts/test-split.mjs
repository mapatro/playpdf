// Dependency-light tests for the split logic (range + split-all).
//
// Run: npm run test:split   (or: node scripts/test-split.mjs)

import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { splitPdfRange, splitPdfAll } from '../src/services/pdfService.js'

async function makePdf(pageCount) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400])
    page.drawText(`Test page ${i + 1}`, { x: 40, y: 350, size: 18 })
  }
  return doc.save()
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  // 1. Range extract: 5-page doc, pages 2–4 → 3 pages.
  const pdf5 = await makePdf(5)
  const rangeBytes = await splitPdfRange(pdf5, 2, 4)
  const rangeDoc = await PDFDocument.load(rangeBytes)
  if (rangeDoc.getPageCount() !== 3) {
    fail(`range extract expected 3 pages, got ${rangeDoc.getPageCount()}`)
  }

  // 2. Out-of-range throws.
  let threw = false
  try {
    await splitPdfRange(pdf5, 4, 9)
  } catch {
    threw = true
  }
  if (!threw) fail('splitPdfRange should reject an out-of-range range')

  threw = false
  try {
    await splitPdfRange(pdf5, 3, 2)
  } catch {
    threw = true
  }
  if (!threw) fail('splitPdfRange should reject from > to')

  // 3. Split all: 3-page doc → zip with 3 one-page PDFs.
  const pdf3 = await makePdf(3)
  const zipBlob = await splitPdfAll(pdf3)
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer())
  const zip = await JSZip.loadAsync(zipBytes)
  const names = Object.keys(zip.files).sort()
  if (names.length !== 3) {
    fail(`split-all expected 3 zip entries, got ${names.length}`)
  }
  const expectedNames = ['page-1.pdf', 'page-2.pdf', 'page-3.pdf']
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    fail(`split-all entry names wrong: ${JSON.stringify(names)}`)
  }
  for (const name of names) {
    const entryBytes = await zip.files[name].async('uint8array')
    const entryDoc = await PDFDocument.load(entryBytes)
    if (entryDoc.getPageCount() !== 1) {
      fail(`split-all entry ${name} should have 1 page, got ${entryDoc.getPageCount()}`)
    }
  }

  console.log(
    'PASS: split range 5→[2,4]=3 pages; out-of-range & from>to rejected; split-all 3-page → 3 one-page zip entries.',
  )
}

main().catch((err) => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})
