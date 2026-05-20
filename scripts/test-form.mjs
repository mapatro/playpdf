// Dependency-light tests for inspectForm + fillFormFields.
//
// Run: npm run test:form   (or: node scripts/test-form.mjs)

import { PDFDocument } from 'pdf-lib'
import { inspectForm, fillFormFields } from '../src/services/pdfService.js'

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

async function makeFormPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 600])
  const form = doc.getForm()
  const name = form.createTextField('full_name')
  name.addToPage(page, { x: 50, y: 520, width: 200, height: 20 })
  const newsletter = form.createCheckBox('newsletter')
  newsletter.addToPage(page, { x: 50, y: 480, width: 12, height: 12 })
  const color = form.createDropdown('color')
  color.addOptions(['red', 'green', 'blue'])
  color.addToPage(page, { x: 50, y: 440, width: 120, height: 18 })
  return doc.save()
}

async function main() {
  const pdf = await makeFormPdf()

  // 1. Inspect: must find 3 fields with correct types.
  const fields = await inspectForm(pdf)
  if (!Array.isArray(fields)) fail('inspectForm should return an array for a form PDF')
  if (fields.length !== 3) fail(`expected 3 fields, got ${fields.length}`)
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
  if (byName.full_name?.type !== 'text') fail('full_name should be text')
  if (byName.newsletter?.type !== 'checkbox') fail('newsletter should be checkbox')
  if (byName.color?.type !== 'dropdown') fail('color should be dropdown')
  // Options surfaced.
  if (!byName.color.options || byName.color.options.length !== 3) {
    fail('color dropdown should expose 3 options')
  }
  // Page index + normalized coords sanity.
  if (byName.full_name.page !== 0) fail('full_name should be on page 0')
  if (
    byName.full_name.x < 0 ||
    byName.full_name.x > 1 ||
    byName.full_name.width <= 0
  ) {
    fail('field coords should be normalized in [0,1]')
  }

  // 2. inspectForm returns null for a PDF with no form.
  const plain = await PDFDocument.create()
  plain.addPage([200, 200]).drawText('hi', { x: 20, y: 100, size: 12 })
  const plainBytes = await plain.save()
  const noForm = await inspectForm(plainBytes)
  if (noForm !== null) fail('inspectForm should return null for plain PDFs')

  // 3. Fill the form and verify values via inspectForm again.
  const filled = await fillFormFields(pdf, {
    full_name: 'Ada Lovelace',
    newsletter: true,
    color: 'green',
  })
  const re = await inspectForm(filled)
  const reByName = Object.fromEntries(re.map((f) => [f.name, f]))
  if (reByName.full_name.value !== 'Ada Lovelace') {
    fail(`full_name value not persisted, got ${reByName.full_name.value}`)
  }
  if (reByName.newsletter.value !== true) {
    fail(`newsletter not checked, got ${reByName.newsletter.value}`)
  }
  if (reByName.color.value !== 'green') {
    fail(`color not selected, got ${reByName.color.value}`)
  }

  // 4. Flatten removes the form fields.
  const flattened = await fillFormFields(
    pdf,
    { full_name: 'Grace Hopper' },
    { flatten: true },
  )
  const afterFlatten = await inspectForm(flattened)
  if (afterFlatten !== null && afterFlatten.length !== 0) {
    fail(
      `flatten should remove form fields, got ${afterFlatten?.length} remaining`,
    )
  }

  // 5. Empty values map rejected.
  let threw = false
  try {
    await fillFormFields(pdf, {})
  } catch {
    threw = true
  }
  if (!threw) fail('fillFormFields should reject empty values map')

  console.log(
    'PASS: inspectForm finds typed fields + null for plain PDFs; fillFormFields persists text/checkbox/dropdown; flatten clears form.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
