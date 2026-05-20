# playPDF

Privacy-first, **100% client-side** PDF tools. Merge, split, rotate and
reorder PDFs entirely in your browser. Your files are **never uploaded** —
there is no backend, no account, no paywall.

## Why it's different

The entire point of this app is privacy. All PDF processing runs in the
browser using [`pdf-lib`](https://pdfjs.express/) and
[`pdfjs-dist`](https://mozilla.github.io/pdf.js/). It is a pure static
site. No file or document content ever leaves your machine. We collect
only anonymous, bucketed usage counts (e.g. "a merge happened with N
files").

## Status

MVP. **Merge** is fully functional end-to-end. **Split / Rotate /
Reorder** are scaffolded (UI buttons + `pdfService.js` stubs) and marked
"Coming soon".

## Tech stack

- Vite + React 18 (JavaScript / JSX, no TypeScript)
- Tailwind CSS v4 (via the official `@tailwindcss/vite` plugin)
- `pdf-lib` — PDF manipulation
- `pdfjs-dist` — page thumbnail rendering (worker is bundled, **no CDN**)
- Plain React hooks for state, single page (no React Router)

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # preview the production build locally
npm run test:merge  # runs the merge logic test
```

## Deployment

Deployed automatically to **GitHub Pages** via the official GitHub Pages
Actions on every push to `main` (see `.github/workflows/deploy.yml`).

- Vite `base` is `'/'` because the site is served from a custom domain
  (not a `user.github.io/repo` subpath).
- `public/CNAME` contains `pdf.patroventure.com` and is emitted into the
  build so GitHub Pages keeps the custom domain configured.

### Custom domain DNS

In the DNS for `patroventure.com`, add a **CNAME** record:

| Type  | Name | Value                 |
| ----- | ---- | --------------------- |
| CNAME | pdf  | `mapatro.github.io.`  |

Then in the GitHub repo: **Settings → Pages**, set the custom domain to
`pdf.patroventure.com` and enable **Enforce HTTPS**.

## Analytics token TODO

Analytics are abstracted in `src/services/analytics.js`. They are
**disabled** until configured:

- Replace the `CF_BEACON_TOKEN = 'REPLACE_ME'` placeholder with the real
  Cloudflare Web Analytics site token.
- While the placeholder is in place (or in dev), the beacon is **not**
  injected and `track()` is a `console.debug` no-op.
- Telemetry is anonymous and bucketed only — never file names or
  contents.

## Project layout

```
public/            CNAME, favicon
src/
  components/      FileUpload, PagePreview, OperationPanel, PrivacyFooter
  services/        pdfService (merge + stubs), pdfRenderService, analytics
scripts/           test-merge.mjs (merge logic test)
.github/workflows/ deploy.yml (GitHub Pages)
```

## License

[MIT](./LICENSE) — Copyright © PatroVenture.

Open source on purpose: the "no upload" privacy claim is verifiable
because the code is public.
