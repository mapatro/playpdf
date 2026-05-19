import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed as a GitHub Pages PROJECT site at
// https://mapatro.github.io/playpdf/ , so `base` MUST be the repo name
// '/playpdf/' for assets to resolve correctly.
//
// To switch to the custom domain pdf.patroventure.com later (once it is
// booked): rename public/CNAME.disabled back to public/CNAME AND set
// `base` here back to '/'.
//
// Local dev:  npm run dev   (http://localhost:5173/playpdf/)
// Production: npm run build  -> dist/ -> GitHub Pages -> project URL
export default defineConfig({
  base: '/playpdf/',
  plugins: [react(), tailwindcss()],
})
