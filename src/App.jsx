import { useCallback, useState } from 'react'
import FileUpload from './components/FileUpload.jsx'
import PagePreview from './components/PagePreview.jsx'
import OperationPanel from './components/OperationPanel.jsx'
import PrivacyFooter from './components/PrivacyFooter.jsx'
import InfoSections from './components/InfoSections.jsx'
import {
  mergePdfs,
  splitPdfRange,
  splitPdfAll,
  rotatePdf,
  reorderPages,
  deletePages,
  imagesToPdf,
  redactPdf,
  downloadBlob,
} from './services/pdfService.js'
import {
  renderThumbnails,
  renderPagesAsJpeg,
} from './services/pdfRenderService.js'
import { track, bytesBucket } from './services/analytics.js'
import JSZip from 'jszip'

let idCounter = 0
const nextId = () => `f${++idCounter}`

const baseName = (name) => name.replace(/\.pdf$/i, '')

export default function App() {
  // Each entry: { id, file, status, thumbnails, pageCount, buffer }
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeOp, setActiveOp] = useState('merge')

  const addFiles = useCallback(async (incoming) => {
    const entries = incoming.map((file) => ({
      id: nextId(),
      file,
      status: 'rendering',
      thumbnails: [],
      pageCount: undefined,
      buffer: null,
    }))
    setFiles((prev) => [...prev, ...entries])
    setMessage('')
    setError('')

    // Read + render each file fully client-side.
    for (const entry of entries) {
      try {
        const buffer = new Uint8Array(await entry.file.arrayBuffer())
        const { pageCount, thumbnails } = await renderThumbnails(buffer, {
          maxPages: 1,
        })
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: 'ready', thumbnails, pageCount, buffer }
              : f,
          ),
        )
      } catch (err) {
        console.error('Failed to render PDF preview:', err)
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: 'error' } : f,
          ),
        )
      }
    }
  }, [])

  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    setMessage('')
    setError('')
  }, [])

  const selectOp = useCallback((op) => {
    setActiveOp(op)
    setMessage('')
    setError('')
  }, [])

  const handleMerge = useCallback(async () => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const sources = files.map((f) => f.buffer ?? f.file)
      const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0)

      const mergedBytes = await mergePdfs(sources)
      downloadBlob(mergedBytes, 'merged.pdf')

      track('merge', {
        fileCount: files.length,
        totalBytesBucket: bytesBucket(totalBytes),
      })

      setMessage(
        `Merged ${files.length} files. Your download (merged.pdf) should start automatically.`,
      )
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong while merging.')
    } finally {
      setBusy(false)
    }
  }, [files])

  const runSingle = useCallback(async (fn) => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await fn()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleSplitRange = useCallback(
    (file, from, to) =>
      runSingle(async () => {
        const bytes = await splitPdfRange(file.buffer ?? file.file, from, to)
        const name = `${baseName(file.file.name)}-pages-${from}-${to}.pdf`
        downloadBlob(bytes, name)
        track('split', { pageCount: file.pageCount, mode: 'range' })
        setMessage(
          `Extracted pages ${from}–${to}. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleSplitAll = useCallback(
    (file) =>
      runSingle(async () => {
        const zip = await splitPdfAll(file.buffer ?? file.file)
        const name = `${baseName(file.file.name)}-pages.zip`
        downloadBlob(zip, name)
        track('split', { pageCount: file.pageCount, mode: 'all' })
        setMessage(
          `Split into ${file.pageCount} single-page PDFs. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleRotate = useCallback(
    (file, rotations) =>
      runSingle(async () => {
        const bytes = await rotatePdf(file.buffer ?? file.file, { rotations })
        const name = `${baseName(file.file.name)}-rotated.pdf`
        downloadBlob(bytes, name)
        track('rotate', {
          pageCount: file.pageCount,
          mode: 'per-page',
        })
        setMessage(
          `Rotated PDF. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleReorder = useCallback(
    (file, order) =>
      runSingle(async () => {
        const bytes = await reorderPages(file.buffer ?? file.file, order)
        const name = `${baseName(file.file.name)}-reordered.pdf`
        downloadBlob(bytes, name)
        track('reorder', { pageCount: file.pageCount, mode: 'manual' })
        setMessage(
          `Reordered pages. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleDelete = useCallback(
    (file, indices) =>
      runSingle(async () => {
        const bytes = await deletePages(file.buffer ?? file.file, indices)
        const name = `${baseName(file.file.name)}-trimmed.pdf`
        downloadBlob(bytes, name)
        track('delete', {
          pageCount: file.pageCount,
          removed: indices.length,
        })
        setMessage(
          `Deleted ${indices.length} page${indices.length === 1 ? '' : 's'}. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleImagesToPdf = useCallback(
    (images) =>
      runSingle(async () => {
        const bytes = await imagesToPdf(images)
        const name = 'images.pdf'
        downloadBlob(bytes, name)
        track('imagesToPdf', { count: images.length })
        setMessage(
          `Built a PDF from ${images.length} image${images.length === 1 ? '' : 's'}. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handleRedact = useCallback(
    (file, rectsByPage) =>
      runSingle(async () => {
        const bytes = await redactPdf(
          file.buffer ?? file.file,
          rectsByPage,
        )
        const name = `${baseName(file.file.name)}-redacted.pdf`
        downloadBlob(bytes, name)
        const totalRects = Object.values(rectsByPage).reduce(
          (s, r) => s + r.length,
          0,
        )
        track('redact', {
          pageCount: file.pageCount,
          rectCount: totalRects,
        })
        setMessage(
          `Applied ${totalRects} redaction${totalRects === 1 ? '' : 's'}. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  const handlePdfToJpg = useCallback(
    (file) =>
      runSingle(async () => {
        const pages = await renderPagesAsJpeg(file.buffer ?? file.file)
        const zip = new JSZip()
        for (const { name, blob } of pages) zip.file(name, blob)
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        const name = `${baseName(file.file.name)}-pages.zip`
        downloadBlob(zipBlob, name)
        track('pdfToJpg', { pageCount: file.pageCount })
        setMessage(
          `Exported ${pages.length} pages as JPGs. Your download (${name}) should start automatically.`,
        )
      }),
    [runSingle],
  )

  return (
    <div className="flex min-h-full flex-col bg-orange-50/40 dark:bg-slate-950">
      <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-orange-600 dark:text-orange-400"
          >
            <span aria-hidden="true">📄</span> playPDF
          </a>
          <a
            href="https://patroventure.com"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
          >
            A PatroVenture project ↗
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Free, private PDF tools
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 dark:text-slate-400 sm:text-base">
            Merge, split, rotate, reorder and delete PDF pages — 100% in
            your browser. Your files never leave your device.
          </p>
        </header>

        {/* Hide the PDF-input UI when the active op brings its own input
            (e.g. Images → PDF accepts image files via its own picker). */}
        {activeOp !== 'jpg-to-pdf' && (
          <>
            <FileUpload
              files={files}
              onAddFiles={addFiles}
              onRemoveFile={removeFile}
            />
            <PagePreview files={files} />
          </>
        )}

        <OperationPanel
          files={files}
          busy={busy}
          activeOp={activeOp}
          onSelectOp={selectOp}
          onMerge={handleMerge}
          onSplitRange={handleSplitRange}
          onSplitAll={handleSplitAll}
          onRotate={handleRotate}
          onReorder={handleReorder}
          onDelete={handleDelete}
          onImagesToPdf={handleImagesToPdf}
          onPdfToJpg={handlePdfToJpg}
          onRedact={handleRedact}
          message={message}
          error={error}
        />

        <InfoSections />
      </main>

      <PrivacyFooter />
    </div>
  )
}
