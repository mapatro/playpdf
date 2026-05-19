import { useCallback, useState } from 'react'
import FileUpload from './components/FileUpload.jsx'
import PagePreview from './components/PagePreview.jsx'
import OperationPanel from './components/OperationPanel.jsx'
import PrivacyFooter from './components/PrivacyFooter.jsx'
import { mergePdfs, downloadBlob } from './services/pdfService.js'
import { renderThumbnails } from './services/pdfRenderService.js'
import { track, bytesBucket } from './services/analytics.js'

let idCounter = 0
const nextId = () => `f${++idCounter}`

export default function App() {
  // Each entry: { id, file, status, thumbnails, pageCount, buffer }
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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

  const handleMerge = useCallback(async () => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const sources = files.map((f) => f.buffer ?? f.file)
      const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0)

      const mergedBytes = await mergePdfs(sources)
      downloadBlob(mergedBytes, 'merged.pdf')

      // Anonymous, bucketed telemetry only — never names or contents.
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

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            playPDF
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Merge, split, rotate and reorder PDFs — privately, in your
            browser.
          </p>
        </header>

        <FileUpload
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
        />

        <PagePreview files={files} />

        <OperationPanel
          fileCount={files.length}
          busy={busy}
          onMerge={handleMerge}
          message={message}
          error={error}
        />
      </main>

      <PrivacyFooter />
    </div>
  )
}
