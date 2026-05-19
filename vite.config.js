import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployment target is the custom domain pdf.patroventure.com served by
// GitHub Pages, so `base` is '/' (NOT '/playpdf/').
// Local dev:  npm run dev   (http://localhost:5173)
// Production: npm run build  -> dist/ -> GitHub Pages -> custom domain
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
