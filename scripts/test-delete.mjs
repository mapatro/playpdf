// Dependency-light tests for deletePages.
//
// Run: npm run test:delete   (or: node scripts/test-delete.mjs)

import { PDFDocument } from 'pdf-lib'
import { deletePages } from '../src/services/pdfService.js'

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
  // 1. Happy path: 5-page doc, delete [1,3] → 3 pages left (originals 1,3,5).
  const pdf5 = await makePdf(5)
  const trimmed = await deletePages(pdf5, [1, 3])
  const doc = await PDFDocument.load(trimmed)
  if (doc.getPageCount() !== 3) {
    fail(`expected 3 pages after deleting 2, got ${doc.getPageCount()}`)
  }

  // 2. Out-of-range index rejected.
  let threw = false
  try {
    await deletePages(pdf5, [0, 99])
  } catch {
    threw = true
  }
  if (!threw) fail('deletePages should reject out-of-range index')

  // 3. Empty indices rejected.
  threw = false
  try {
    await deletePages(pdf5, [])
  } catch {
    threw = true
  }
  if (!threw) fail('deletePages should reject empty selection')

  // 4. Deleting every page rejected (would produce an empty PDF).
  threw = false
  try {
    await deletePages(pdf5, [0, 1, 2, 3, 4])
  } catch {
    threw = true
  }
  if (!threw) fail('deletePages should refuse to delete every page')

  // 5. Duplicate indices in input are tolerated (deduped via Set).
  const dedup = await deletePages(pdf5, [2, 2, 2])
  const dedupDoc = await PDFDocument.load(dedup)
  if (dedupDoc.getPageCount() !== 4) {
    fail(`duplicates dedup expected 4 pages, got ${dedupDoc.getPageCount()}`)
  }

  console.log(
    'PASS: deletePages 5→[1,3]=3 pages; OOB/empty/all-pages rejected; duplicate indices deduped.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
