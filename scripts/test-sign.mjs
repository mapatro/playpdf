// Dependency-light tests for signAndFillPdf.
//
// Run: npm run test:sign   (or: node scripts/test-sign.mjs)

import { PDFDocument } from 'pdf-lib'
import { signAndFillPdf } from '../src/services/pdfService.js'

async function makePdf(pageCount) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400])
    page.drawText(`Test page ${i + 1}`, { x: 40, y: 350, size: 18 })
  }
  return doc.save()
}

// Minimal valid 1x1 red PNG (acts as a stand-in signature image).
const PNG_1x1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
)

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  const pdf = await makePdf(2)

  // 1. Mixed signature + text placements produce a valid larger PDF.
  const out = await signAndFillPdf(pdf, {
    0: [
      { kind: 'sig', x: 0.1, y: 0.1, width: 0.2, png: PNG_1x1 },
      { kind: 'text', x: 0.1, y: 0.5, text: 'Signed by tests', fontSize: 14 },
    ],
  })
  const outDoc = await PDFDocument.load(out)
  if (outDoc.getPageCount() !== 2) {
    fail(`expected 2 pages, got ${outDoc.getPageCount()}`)
  }
  if (out.byteLength <= pdf.byteLength) {
    fail('signed PDF should be larger than source')
  }

  // 2. Empty placements rejected.
  let threw = false
  try {
    await signAndFillPdf(pdf, {})
  } catch {
    threw = true
  }
  if (!threw) fail('signAndFillPdf should reject empty placements')

  // 3. Unknown kind rejected.
  threw = false
  try {
    await signAndFillPdf(pdf, {
      0: [{ kind: 'lol', x: 0, y: 0 }],
    })
  } catch {
    threw = true
  }
  if (!threw) fail('signAndFillPdf should reject unknown placement kind')

  // 4. Out-of-range page index rejected.
  threw = false
  try {
    await signAndFillPdf(pdf, {
      99: [{ kind: 'text', x: 0, y: 0, text: 'x', fontSize: 12 }],
    })
  } catch {
    threw = true
  }
  if (!threw) fail('signAndFillPdf should reject OOB page index')

  console.log(
    'PASS: signAndFillPdf places sig+text, output valid; empty/unknown/OOB rejected.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
