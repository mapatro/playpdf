import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss()],
})
