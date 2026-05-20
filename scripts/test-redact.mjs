// Dependency-light tests for redactPdf.
//
// Run: npm run test:redact   (or: node scripts/test-redact.mjs)

import { PDFDocument } from 'pdf-lib'
import { redactPdf } from '../src/services/pdfService.js'

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
  const pdf = await makePdf(3)

  // 1. Happy path: redact a box on page 1; output must still be a valid PDF
  //    with the same page count, and bigger than the source (a rect was drawn).
  const out = await redactPdf(pdf, {
    1: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.2 }],
  })
  const outDoc = await PDFDocument.load(out)
  if (outDoc.getPageCount() !== 3) {
    fail(`expected 3 pages, got ${outDoc.getPageCount()}`)
  }
  if (out.byteLength <= pdf.byteLength) {
    fail('redacted PDF should be larger than the source (rect added)')
  }

  // 2. Empty map rejected.
  let threw = false
  try {
    await redactPdf(pdf, {})
  } catch {
    threw = true
  }
  if (!threw) fail('redactPdf should reject empty rect map')

  // 3. Out-of-range page index rejected.
  threw = false
  try {
    await redactPdf(pdf, { 99: [{ x: 0, y: 0, width: 0.5, height: 0.5 }] })
  } catch {
    threw = true
  }
  if (!threw) fail('redactPdf should reject out-of-range page index')

  console.log(
    'PASS: redactPdf draws rects without changing page count; empty/OOB rejected.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
