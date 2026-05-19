# playPDF — Development & Deployment Architecture

playPDF is a privacy-first, 100% client-side PDF toolkit (merge / split /
rotate / reorder). It is a subproject of **PatroVenture** and ships as a
static site to GitHub Pages on the custom domain `pdf.patroventure.com`.

## 1. End-to-end pipeline: development → deployment

```mermaid
flowchart TD
    subgraph DEV["🧑‍💻 Local development"]
        A1["Vite + React 18 app<br/>src/ components & services"]
        A2["npm run dev<br/>(local preview)"]
        A3["node scripts/test-*.mjs<br/>(merge/split/rotate/reorder tests)"]
        A1 --> A2
        A1 --> A3
    end

    A3 -->|"git push origin main"| GIT["GitHub repo<br/>github.com/mapatro/playpdf"]

    subgraph CI["⚙️ GitHub Actions — .github/workflows/deploy.yml"]
        direction TB
        B1["build job (ubuntu, Node 20)<br/>checkout → npm ci → npm run build"]
        B2["Vite production build → dist/<br/>(JS/CSS bundle + public/ assets:<br/>CNAME, robots.txt, sitemap.xml, favicon)"]
        B3["upload-pages-artifact (dist/)"]
        B4["deploy job<br/>actions/deploy-pages@v4"]
        B1 --> B2 --> B3 --> B4
    end

    GIT -->|"push to main / workflow_dispatch"| B1

    B4 --> PAGES["GitHub Pages<br/>(static hosting)"]

    subgraph NET["🌐 Domain & TLS"]
        D1["public/CNAME pins<br/>pdf.patroventure.com"]
        D2["Namecheap DNS<br/>CNAME pdf → mapatro.github.io"]
        D3["GitHub-provisioned<br/>Let's Encrypt cert + Enforce HTTPS"]
    end

    PAGES --- D1
    D2 --> PAGES
    D3 --> PAGES

    PAGES --> USER["👤 User's browser<br/>https://pdf.patroventure.com"]
```

## 2. Runtime architecture & privacy boundary

Everything that touches a PDF runs **inside the user's browser**. Files are
never uploaded — there is no backend.

```mermaid
flowchart LR
    subgraph BROWSER["👤 User's browser — the privacy boundary (no upload, no server)"]
        direction TB
        UI["React UI<br/>App.jsx · FileUpload · PagePreview<br/>OperationPanel · InfoSections · PrivacyFooter"]

        subgraph SVC["Client-side services"]
            S1["pdfService.js<br/>pdf-lib → merge / split / rotate / reorder"]
            S2["pdfRenderService.js<br/>pdfjs-dist → page thumbnails"]
            S3["jszip<br/>split-all → .zip"]
        end

        FILE["Local File (in memory only)"]
        DL["Downloaded result<br/>(Blob → browser download)"]

        UI --> FILE
        FILE --> S1
        FILE --> S2
        S1 --> S3
        S1 --> DL
        S3 --> DL
        S2 --> UI
    end

    UI -. "anonymous, aggregate counts only<br/>(no file names/contents)" .-> CF["Cloudflare Web Analytics<br/>beacon"]

    SEO["SEO / discovery layer<br/>JSON-LD (WebApplication, FAQPage)<br/>sitemap.xml · robots.txt"] --> GSC["Google Search Console<br/>→ Google index"]
    BROWSER -.served with.- SEO
```

## 3. Tech stack summary

| Layer | Choice |
|-------|--------|
| UI framework | React 18 |
| Build tool | Vite (`base: '/'`, custom domain) |
| Styling | Tailwind CSS v4 (light-orange project theme) |
| PDF engine | `pdf-lib` (manipulation), `pdfjs-dist` (rendering) |
| Zip | `jszip` (split-every-page) |
| Hosting | GitHub Pages (static) |
| CI/CD | GitHub Actions → `deploy-pages` on push to `main` |
| Domain/TLS | Namecheap DNS CNAME + GitHub Let's Encrypt |
| Analytics | Cloudflare Web Analytics (cookieless) |
| Discovery | JSON-LD + sitemap/robots + Google Search Console |

## 4. Key design property

**No server, no upload.** The absence of a backend is the core feature, not
an omission: PDFs are read into memory, processed via WebAssembly/JS, and
the result is handed straight back as a browser download. Only anonymous,
bucketed usage counters (never file names or contents) leave the device.
