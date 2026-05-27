// Generate PWA icons from the existing favicon.svg.
// Run once (manually) when the brand mark changes. Outputs into public/.
//
//   npm run gen:icons
//
// Produces:
//   public/icon-192.png         — standard 192x192
//   public/icon-512.png         — standard 512x512
//   public/icon-maskable.png    — 512x512 with safe-area padding for
//                                  Android adaptive icons (10% margin)
//   public/apple-touch-icon.png — 180x180 for iOS Home Screen
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgPath = resolve(root, 'public/favicon.svg')
const svg = readFileSync(svgPath)

async function emit(name, size, opts = {}) {
  const out = resolve(root, 'public', name)
  const { padPct = 0, bg = null } = opts
  if (padPct > 0) {
    // Render the SVG at (1 - 2*padPct) * size then composite onto a
    // square background with padding around it — this gives a safe-area
    // margin for maskable icons so they don't get clipped by adaptive
    // Android masks.
    const inner = Math.round(size * (1 - 2 * padPct))
    const buf = await sharp(svg, { density: 384 })
      .resize(inner, inner)
      .png()
      .toBuffer()
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: bg ?? { r: 234, g: 88, b: 12, alpha: 1 }, // orange-600 — matches the brand tile so the maskable safe-area doesn't show a contrasting frame
      },
    })
      .composite([
        { input: buf, top: Math.round((size - inner) / 2), left: Math.round((size - inner) / 2) },
      ])
      .png()
      .toFile(out)
  } else {
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out)
  }
  console.log(`  ✓ ${name} (${size}x${size}${padPct ? `, ${padPct * 100}% safe area` : ''})`)
}

console.log('Generating PWA icons from public/favicon.svg…')
await emit('icon-192.png', 192)
await emit('icon-512.png', 512)
await emit('icon-maskable.png', 512, { padPct: 0.1 })
await emit('apple-touch-icon.png', 180)
console.log('done.')
