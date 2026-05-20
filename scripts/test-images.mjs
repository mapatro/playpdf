// Dependency-light tests for imagesToPdf.
//
// Run: npm run test:images   (or: node scripts/test-images.mjs)

import { PDFDocument } from 'pdf-lib'
import { imagesToPdf } from '../src/services/pdfService.js'

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

// Minimal valid 1x1 red PNG (89 50 4E 47 ... IEND).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

async function main() {
  // 1. Two PNGs -> 2-page PDF.
  const bytes = await imagesToPdf([PNG_1x1, PNG_1x1])
  const doc = await PDFDocument.load(bytes)
  if (doc.getPageCount() !== 2) {
    fail(`expected 2 pages, got ${doc.getPageCount()}`)
  }

  // 2. Empty input rejected.
  let threw = false
  try {
    await imagesToPdf([])
  } catch {
    threw = true
  }
  if (!threw) fail('imagesToPdf should reject empty input')

  // 3. Unsupported bytes rejected.
  threw = false
  try {
    await imagesToPdf([new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])])
  } catch {
    threw = true
  }
  if (!threw) fail('imagesToPdf should reject unknown image bytes')

  console.log('PASS: imagesToPdf 2 PNGs → 2-page PDF; empty & unknown bytes rejected.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
