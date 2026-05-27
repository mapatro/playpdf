import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed to the custom domain at https://pdf.patroventure.com/ via
// GitHub Pages, so `base` is the site root '/' and public/CNAME pins
// the domain.
//
// Fallback (only if the custom domain is ever dropped): set `base` to
// '/playpdf/' and remove public/CNAME to deploy to the GitHub Pages
// PROJECT URL https://mapatro.github.io/playpdf/ instead.
//
// Local dev:  npm run dev   (http://localhost:5173/)
// Production: npm run build  -> dist/ -> GitHub Pages -> custom domain
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    // PWA: makes playPDF installable (desktop + mobile) and fully
    // usable offline once cached. The whole app is client-side, so
    // offline support is "just" pre-caching the bundle + pdf.worker.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'playPDF — Free, private PDF editor',
        short_name: 'playPDF',
        description:
          'Merge, split, sign, fill and edit PDFs entirely in your browser. Files never leave your device. Works offline.',
        theme_color: '#ea580c',
        background_color: '#fff7ed',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'any',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The pdf.js worker is ~1.4 MB — default workbox limit is 2 MB
        // so we're fine, but bump explicitly in case the bundle grows.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Precache everything the build emits — that's the whole app,
        // and since there's no backend, precaching = full offline.
        globPatterns: ['**/*.{js,css,html,svg,png,mjs,woff2}'],
      },
    }),
  ],
})
