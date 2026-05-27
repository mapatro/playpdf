// Crop the user-supplied 2x2 logo sheet into the header brand images.
//
// Source: C:\Users\mpatr\Downloads\playPdf\PlayPdf Logos.png (2816x1536)
//   ┌───────────────┬───────────────┐
//   │ light wordmark│ icon-only     │  ← top
//   ├───────────────┼───────────────┤
//   │ dark wordmark │ dark-pill mark│  ← bottom
//   └───────────────┴───────────────┘
//
// We extract the top-left (light bg) and bottom-right (dark pill)
// variants for use in the header. The PWA install icons are
// generated separately by gen-pwa-icons.mjs from favicon.svg — see
// the rationale block in App.jsx near the logo.
//
// Run via:  npm run gen:logo

import sharp from 'sharp'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const SRC = 'C:\\Users\\mpatr\\Downloads\\playPdf\\PlayPdf Logos.png'

const meta = await sharp(SRC).metadata()
console.log('source:', meta.width, 'x', meta.height)

// Hand-tuned bounding boxes within the 2816x1536 sheet. Retune if the
// source mockup changes.
//
// We ship the dark-navy-pill variant only — it works as a clean
// "branded chip" against either a light header background OR a dark
// one (no paper-mockup texture leaking around the edges, which the
// light/dark wordmark variants both have). One asset = simpler
// header markup and consistent brand presence in both color schemes.
const REGIONS = {
  // Bottom-right: dark navy pill with white art. Tight bbox on the
  // pill only — exclude the paper around it.
  brandPill: { left: 1560, top: 960, width: 1120, height: 300 },
}

async function dump(name, region) {
  const out = resolve(root, 'public', name)
  await sharp(SRC).extract(region).png().toFile(out)
  const m = await sharp(out).metadata()
  console.log(`  ✓ ${name} (${m.width}x${m.height})`)
}

console.log('extracting header brand asset…')
await dump('playpdf-logo.png', REGIONS.brandPill)
// Remove the older two-variant outputs if they exist so we don't
// confuse anyone looking in public/.
for (const stale of ['playpdf-logo-light.png', 'playpdf-logo-dark.png', 'playpdf-mark.png']) {
  try {
    const fs = await import('node:fs')
    const p = resolve(root, 'public', stale)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      console.log(`  – removed stale ${stale}`)
    }
  } catch {}
}
console.log('done.')
