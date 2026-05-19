// Dependency-light tests for the rotate logic (additive + normalized).
//
// Run: npm run test:rotate   (or: node scripts/test-rotate.mjs)

import { PDFDocument } from 'pdf-lib'
import { rotatePdf } from '../src/services/pdfService.js'

async function makePdf(pageCount, initialRotations = {}) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400])
    page.drawText(`Test page ${i + 1}`, { x: 40, y: 350, size: 18 })
    if (initialRotations[i]) page.setRotation({ angle: initialRotations[i], type: 'degrees' })
  }
  return doc.save()
}

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function main() {
  // 1. Rotate a 0° page by 90 → 90.
  const pdf = await makePdf(2)
  const rotated = await rotatePdf(pdf, { rotations: { 0: 90 } })
  const doc = await PDFDocument.load(rotated)
  const p0 = doc.getPage(0).getRotation().angle
  const p1 = doc.getPage(1).getRotation().angle
  if (p0 !== 90) fail(`page 0 expected rotation 90, got ${p0}`)
  if (p1 !== 0) fail(`page 1 (untouched) expected rotation 0, got ${p1}`)

  // 2. Rotate an already-90° page by 90 → 180 (additive + normalized).
  const pdf90 = await makePdf(1, { 0: 90 })
  const rotated2 = await rotatePdf(pdf90, { angle: 90 })
  const doc2 = await PDFDocument.load(rotated2)
  const a = doc2.getPage(0).getRotation().angle
  if (a !== 180) fail(`already-90 page + 90 expected 180, got ${a}`)

  // 3. Global angle 270 across all pages, normalized (270 + 270 = 540 → 180).
  const pdf270 = await makePdf(2, { 0: 270 })
  const rotated3 = await rotatePdf(pdf270, { angle: 270 })
  const doc3 = await PDFDocument.load(rotated3)
  if (doc3.getPage(0).getRotation().angle !== 180) {
    fail(`270 + 270 expected normalized 180, got ${doc3.getPage(0).getRotation().angle}`)
  }
  if (doc3.getPage(1).getRotation().angle !== 270) {
    fail(`0 + 270 expected 270, got ${doc3.getPage(1).getRotation().angle}`)
  }

  console.log(
    'PASS: rotate 0→90; already-90 +90 → 180 (additive); 270+270 → 180 (normalized).',
  )
}

main().catch((err) => {
  console.error('FAIL: unexpected error', err)
  process.exit(1)
})
