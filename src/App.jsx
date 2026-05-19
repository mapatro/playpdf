import { useCallback, useState } from 'react'
import FileUpload from './components/FileUpload.jsx'
import PagePreview from './components/PagePreview.jsx'
import OperationPanel from './components/OperationPanel.jsx'
import PrivacyFooter from './components/PrivacyFooter.jsx'
import {
  mergePdfs,
  splitPdfRange,
  splitPdfAll,
  rotatePdf,
  reorderPages,
  downloadBlob,
} from './services/pdfService.js'
import { renderThumbnails } from './services/pdfRenderService.js'
import { track, bytesBucket } from './services/analytics.js'

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

  return (
    <div className="flex min-h-full flex-col bg-orange-50/40">
      <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-orange-600"
          >
            <span aria-hidden="true">📄</span> playPDF
          </a>
          <a
            href="https://patroventure.com"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-orange-600"
          >
            A PatroVenture project ↗
          </a>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Free, private PDF tools
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 sm:text-base">
            Merge, split, rotate and reorder PDFs — 100% in your browser.
            Your files never leave your device.
          </p>
        </header>

        <FileUpload
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
        />

        <PagePreview files={files} />

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
          message={message}
          error={error}
        />
      </main>

      <PrivacyFooter />
    </div>
  )
}
