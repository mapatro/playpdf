# playPDF

**Privacy-first, 100% client-side PDF tools.** Merge, split, rotate,
reorder, delete pages, sign, redact, and convert PDFs ↔ images —
entirely in your browser. Your files are **never uploaded** to a
server. No account, no paywall, no watermark.

🔗 Live at **[pdf.patroventure.com](https://pdf.patroventure.com)**

## Why playPDF

Every other free PDF tool uploads your file to a server. For most
documents that's fine — but for contracts, IDs, medical records, tax
forms, or anything confidential, it isn't.

playPDF runs every operation in the browser using JavaScript and
WebAssembly. There is **no backend** for file content. The privacy
claim is verifiable because this repo is open source — read the code,
check the network tab, see for yourself that nothing leaves the
device.

## What it does

| Operation | What it does |
|---|---|
| **Merge** | Combine multiple PDFs into one, in your chosen order. |
| **Split** | Extract a page range, *or* split every page into separate files. |
| **Rotate** | Rotate every page at once, or each page individually. |
| **Reorder** | Drag thumbnails to rearrange pages, then export. |
| **Delete** | Pick pages to remove from a PDF. |
| **Sign & Fill** | Draw or type a signature; place it on any page. Type free text anywhere to fill printable forms. Touch / stylus / mouse supported. |
| **Redact** | Drag rectangles to black out sensitive areas (visual redaction; for irreversible removal use PDF → JPG round-trip). |
| **Images → PDF** | Combine JPG / PNG images into a single PDF. |
| **PDF → JPG** | Export each page as a JPG, bundled into a `.zip`. |

Anonymous, aggregate usage counts (e.g. "a merge happened") are
collected via Cloudflare Web Analytics. **File names and contents are
never sent.**

## Tech stack

- **Vite + React 18** (JavaScript / JSX, no TypeScript)
- **Tailwind CSS v4** with `prefers-color-scheme` dark mode
- [`pdf-lib`](https://pdf-lib.js.org/) — PDF reading, manipulation, drawing
- [`pdfjs-dist`](https://mozilla.github.io/pdf.js/) — page thumbnail and JPEG rendering (worker bundled, **no CDN**)
- [`jszip`](https://stuk.github.io/jszip/) — bundling split outputs and JPG exports
- Plain React hooks for state, single page (no React Router)

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the end-to-end
dev → deploy diagrams and the runtime/privacy boundary.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build locally
npm test           # run every service test suite
```

Individual test suites: `test:merge`, `test:split`, `test:rotate`,
`test:reorder`, `test:delete`, `test:images`, `test:redact`, `test:sign`.

## Deployment

Deployed automatically to **GitHub Pages** on every push to `main` via
the official Pages Actions (`.github/workflows/deploy.yml`).

- Vite `base` is `'/'` — the site is served from a custom domain.
- `public/CNAME` pins the custom domain across deploys.
- `public/robots.txt` and `public/sitemap.xml` are emitted for SEO.

### Custom domain DNS

In the DNS for `patroventure.com`, a **CNAME** record for the
subdomain:

| Type  | Name | Value                |
| ----- | ---- | -------------------- |
| CNAME | pdf  | `mapatro.github.io`  |

Then in **GitHub → Settings → Pages**, the custom domain is set to
`pdf.patroventure.com` with **Enforce HTTPS** enabled (TLS cert
provisioned by GitHub via Let's Encrypt).

## Project layout

```
docs/              ARCHITECTURE.md (dev → deploy diagrams)
public/            CNAME, favicon, robots.txt, sitemap.xml
src/
  components/      App shell, FileUpload, PagePreview, OperationPanel,
                   InfoSections (SEO/FAQ content), PrivacyFooter
  services/        pdfService (all operations), pdfRenderService
                   (thumbnails + JPEG export), analytics
scripts/           test-*.mjs — one per operation
.github/workflows/ deploy.yml
```

## License

[MIT](./LICENSE) — Copyright © PatroVenture.

Open source on purpose: the "no upload" privacy claim is verifiable
because the code is public.
