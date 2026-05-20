// Below-the-tool content. This exists for humans first (it explains what
// the tool does and answers real questions) and for SEO second — the
// copy uses the natural long-tail phrasing people actually search for
// ("split a PDF without uploading", "merge PDF in browser", etc.).

const OPERATIONS = [
  {
    title: 'Merge PDF files',
    body: 'Combine two or more PDFs into a single document. Add your files, arrange them, and download the merged PDF — all in your browser, with no upload and no file size sent to a server.',
  },
  {
    title: 'Split a PDF',
    body: 'Extract a page range into a new PDF, or split every page into separate files at once. A private, offline way to break a large PDF into smaller pieces without an account or watermark.',
  },
  {
    title: 'Rotate PDF pages',
    body: 'Fix sideways or upside-down scans. Rotate every page at once or each page individually, preview the result, and download the corrected PDF — no upload required.',
  },
  {
    title: 'Reorder pages',
    body: 'Drag page thumbnails to rearrange them, then export a reordered PDF. Useful for fixing scan order or moving sections around, entirely on your device.',
  },
  {
    title: 'Delete pages',
    body: 'Pick pages to remove from a PDF — useful for stripping out blank pages, ads or pages you do not want to share. Removed pages never leave your device.',
  },
]

const FAQ = [
  {
    q: 'Are my PDF files uploaded to a server?',
    a: 'No. Every operation runs entirely in your browser using JavaScript. Your files never leave your device and are never sent to us or anyone else.',
  },
  {
    q: 'Is playPDF free?',
    a: 'Yes, completely free. There is no sign-up, no account, no watermark on output files, and no page or size limits beyond what your browser can handle.',
  },
  {
    q: 'Can I split or merge a PDF without uploading it?',
    a: 'Yes — that is the whole point of playPDF. Splitting, merging, rotating and reordering all happen locally in your browser, so it works even on confidential documents.',
  },
  {
    q: 'Does it work offline?',
    a: 'After the page has loaded once, the processing itself does not need a network connection — it all happens on your device.',
  },
  {
    q: 'Is there a file size limit?',
    a: 'There is no fixed limit. Because everything is processed in your browser, very large files are bounded only by your device’s available memory.',
  },
  {
    q: 'What happens to my files after I close the tab?',
    a: 'Nothing is stored. Files are held in memory only while the tab is open and are gone the moment you close or refresh it.',
  },
]

export default function InfoSections() {
  return (
    <div className="mt-16 space-y-14">
      <section>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          How playPDF works
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          playPDF is a free, privacy-first PDF toolkit that runs 100% in
          your browser. There is no upload step: when you add a file, it is
          read and processed locally on your own device, then the result is
          downloaded straight back to you. Nothing is sent to a server, so
          you can work with sensitive or confidential PDFs safely.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-semibold text-orange-600">1.</span> Drag
            in a PDF (or several) — they stay on your device.
          </li>
          <li>
            <span className="font-semibold text-orange-600">2.</span> Pick
            an operation: merge, split, rotate or reorder.
          </li>
          <li>
            <span className="font-semibold text-orange-600">3.</span>{' '}
            Download the result. No account, no watermark, no tracking of
            your files.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          What you can do
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {OPERATIONS.map(({ title, body }) => (
            <div
              key={title}
              className="rounded-lg border border-orange-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Frequently asked questions
        </h2>
        <div className="mt-4 divide-y divide-orange-100 overflow-hidden rounded-lg border border-orange-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-800 marker:content-none dark:text-slate-100">
                <span className="text-orange-600 group-open:rotate-90 inline-block transition-transform">
                  ›
                </span>{' '}
                {q}
              </summary>
              <p className="mt-2 pl-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
