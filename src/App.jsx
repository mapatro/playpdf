import { useCallback, useEffect, useRef, useState } from 'react'
import FileUpload from './components/FileUpload.jsx'
import PagePreview from './components/PagePreview.jsx'
import OperationPanel from './components/OperationPanel.jsx'
import PrivacyFooter from './components/PrivacyFooter.jsx'
import InfoSections from './components/InfoSections.jsx'
import Sidebar from './components/Sidebar.jsx'
import FillFormWorkspace from './components/FillFormWorkspace.jsx'
import SignAndFillWorkspace from './components/SignAndFillWorkspace.jsx'
import {
  mergePdfs,
  splitPdfRange,
  splitPdfAll,
  rotatePdf,
  reorderPages,
  deletePages,
  imagesToPdf,
  redactPdf,
  signAndFillPdf,
  inspectForm,
  fillFormFields,
  downloadBlob,
} from './services/pdfService.js'
import {
  saveOrDownload,
  saveAsPdf,
  openPdfFiles,
  isFileSystemAccessSupported,
} from './services/fileAccess.js'
import { subscribeInstall, promptInstall } from './services/pwa.js'
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
  // Each entry: { id, file, fileHandle, status, thumbnails, pageCount, buffer }
  // fileHandle is a FileSystemFileHandle when the user opened the file via
  // showOpenFilePicker (Chromium), null otherwise. When present, ops save
  // back to the same file instead of triggering a download.
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeOp, setActiveOp] = useState('merge')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // PWA install state: { canInstall, installed }. Lets the header
  // surface an Install button only when the browser actually offers it.
  const [pwa, setPwa] = useState({ canInstall: false, installed: false })
  useEffect(() => subscribeInstall(setPwa), [])
  // Last PDF-output result, so the user can chain it into the next op
  // without re-downloading and re-uploading.
  //   { bytes, name, kind: 'replace' | 'add', targetFileId? }
  const [lastResult, setLastResult] = useState(null)

  const addFiles = useCallback(async (incoming) => {
    // FileUpload always hands us [{ file, fileHandle? }]. Be lenient and
    // accept bare File objects too in case any other caller predates that.
    const records = incoming.map((r) =>
      r instanceof File ? { file: r, fileHandle: null } : r,
    )
    const entries = records.map(({ file, fileHandle }) => ({
      id: nextId(),
      file,
      fileHandle: fileHandle ?? null,
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
    setLastResult(null)
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
      setLastResult({
        bytes: mergedBytes,
        name: 'merged.pdf',
        kind: 'add',
      })
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
    setLastResult(null)
    try {
      await fn()
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [])

  // Save bytes back to the file's handle (if any) or trigger a download.
  // On in-place save, also refresh the workspace entry so its buffer /
  // thumbnails / pageCount mirror what's now on disk; the lastResult
  // chain pointer is suppressed because the file IS the result.
  // On download, behave like today — leave the workspace untouched and
  // expose lastResult so the user can chain.
  const saveOpResult = useCallback(
    async (file, bytes, fallbackName) => {
      const { savedInPlace } = await saveOrDownload({
        fileHandle: file.fileHandle,
        bytes,
        fallbackName,
      })
      if (savedInPlace) {
        const newFile = new File([bytes], file.file.name, {
          type: 'application/pdf',
        })
        const { pageCount, thumbnails } = await renderThumbnails(bytes, {
          maxPages: 1,
        })
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  file: newFile,
                  buffer: bytes,
                  pageCount,
                  thumbnails,
                  status: 'ready',
                }
              : f,
          ),
        )
      }
      return {
        savedInPlace,
        suffix: savedInPlace
          ? `Saved to ${file.file.name}.`
          : `Your download (${fallbackName}) should start automatically.`,
      }
    },
    [],
  )

  const useResultAsInput = useCallback(async () => {
    if (!lastResult) return
    setBusy(true)
    setError('')
    try {
      const { bytes, name, kind, targetFileId } = lastResult
      const fileObj = new File([bytes], name, { type: 'application/pdf' })
      const { pageCount, thumbnails } = await renderThumbnails(bytes, {
        maxPages: 1,
      })
      if (kind === 'replace' && targetFileId) {
        // Drop any fileHandle: the result's filename diverges from the
        // original on disk, and we don't want the next op to silently
        // overwrite the original. Chained ops download as new files.
        setFiles((prev) =>
          prev.map((f) =>
            f.id === targetFileId
              ? {
                  ...f,
                  file: fileObj,
                  fileHandle: null,
                  buffer: bytes,
                  status: 'ready',
                  thumbnails,
                  pageCount,
                }
              : f,
          ),
        )
        setMessage(`Now editing the result (${name}).`)
      } else {
        // 'add' kind (merge, Images → PDF): append as a new file.
        const newEntry = {
          id: nextId(),
          file: fileObj,
          fileHandle: null,
          status: 'ready',
          thumbnails,
          pageCount,
          buffer: bytes,
        }
        setFiles((prev) => [...prev, newEntry])
        // If the user is in jpg-to-pdf mode (which hides PDF workspace),
        // move them back to a PDF op so they can see the new file.
        if (activeOp === 'jpg-to-pdf') setActiveOp('merge')
        setMessage(`Added the result (${name}) to the workspace.`)
      }
      setLastResult(null)
    } catch (err) {
      console.error(err)
      setError(err?.message || 'Could not load the result as input.')
    } finally {
      setBusy(false)
    }
  }, [lastResult, activeOp])

  const handleSplitRange = useCallback(
    (file, from, to) =>
      runSingle(async () => {
        const bytes = await splitPdfRange(file.buffer ?? file.file, from, to)
        const name = `${baseName(file.file.name)}-pages-${from}-${to}.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        track('split', { pageCount: file.pageCount, mode: 'range' })
        setMessage(`Extracted pages ${from}–${to}. ${suffix}`)
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
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
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        track('rotate', {
          pageCount: file.pageCount,
          mode: 'per-page',
        })
        setMessage(`Rotated PDF. ${suffix}`)
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
  )

  const handleReorder = useCallback(
    (file, order) =>
      runSingle(async () => {
        const bytes = await reorderPages(file.buffer ?? file.file, order)
        const name = `${baseName(file.file.name)}-reordered.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        track('reorder', { pageCount: file.pageCount, mode: 'manual' })
        setMessage(`Reordered pages. ${suffix}`)
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
  )

  const handleDelete = useCallback(
    (file, indices) =>
      runSingle(async () => {
        const bytes = await deletePages(file.buffer ?? file.file, indices)
        const name = `${baseName(file.file.name)}-trimmed.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        track('delete', {
          pageCount: file.pageCount,
          removed: indices.length,
        })
        setMessage(
          `Deleted ${indices.length} page${indices.length === 1 ? '' : 's'}. ${suffix}`,
        )
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
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
        setLastResult({ bytes, name, kind: 'add' })
      }),
    [runSingle],
  )

  const handleInspectForm = useCallback(
    (file) => inspectForm(file.buffer ?? file.file),
    [],
  )

  const handleFillForm = useCallback(
    (file, valuesByName, options) =>
      runSingle(async () => {
        const bytes = await fillFormFields(
          file.buffer ?? file.file,
          valuesByName,
          options,
        )
        const name = `${baseName(file.file.name)}-filled.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        const filledCount = Object.keys(valuesByName).length
        track('fillForm', {
          pageCount: file.pageCount,
          filledCount,
          flattened: Boolean(options?.flatten),
        })
        setMessage(
          `Filled ${filledCount} field${filledCount === 1 ? '' : 's'}${options?.flatten ? ' (flattened)' : ''}. ${suffix}`,
        )
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
  )

  const handleSignAndFill = useCallback(
    (file, placements) =>
      runSingle(async () => {
        const bytes = await signAndFillPdf(
          file.buffer ?? file.file,
          placements,
        )
        const name = `${baseName(file.file.name)}-signed.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        const total = Object.values(placements).reduce(
          (s, items) => s + items.length,
          0,
        )
        track('signAndFill', {
          pageCount: file.pageCount,
          placements: total,
        })
        setMessage(
          `Added ${total} signature/text item${total === 1 ? '' : 's'}. ${suffix}`,
        )
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
  )

  const handleRedact = useCallback(
    (file, rectsByPage) =>
      runSingle(async () => {
        const bytes = await redactPdf(
          file.buffer ?? file.file,
          rectsByPage,
        )
        const name = `${baseName(file.file.name)}-redacted.pdf`
        const { savedInPlace, suffix } = await saveOpResult(file, bytes, name)
        const totalRects = Object.values(rectsByPage).reduce(
          (s, r) => s + r.length,
          0,
        )
        track('redact', {
          pageCount: file.pageCount,
          rectCount: totalRects,
        })
        setMessage(
          `Applied ${totalRects} redaction${totalRects === 1 ? '' : 's'}. ${suffix}`,
        )
        if (!savedInPlace)
          setLastResult({ bytes, name, kind: 'replace', targetFileId: file.id })
      }),
    [runSingle, saveOpResult],
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

  // Called by FillFormWorkspace when the user clicks Save. Writes to
  // the file handle if present, else downloads a -filled.pdf copy.
  // Updates file.buffer so chained ops see the new bytes; skips
  // thumbnail refresh for speed (a stale tiny thumbnail is OK).
  const handleFillFormSave = useCallback(async (file, bytes, options) => {
    const name = `${baseName(file.file.name)}-filled.pdf`
    await saveOrDownload({
      fileHandle: file.fileHandle,
      bytes,
      fallbackName: name,
    })
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== file.id) return f
        const newFile = new File([bytes], f.file.name, {
          type: 'application/pdf',
        })
        return { ...f, file: newFile, buffer: bytes }
      }),
    )
    if (options?.flatten) {
      // Flatten is a notable user action — track once.
      track('fillForm', {
        pageCount: file.pageCount,
        filledCount: 0,
        flattened: true,
      })
    }
  }, [])

  // Same shape as handleFillFormSave but for Sign & Fill.
  const handleSignAndFillSave = useCallback(async (file, bytes) => {
    const name = `${baseName(file.file.name)}-signed.pdf`
    await saveOrDownload({
      fileHandle: file.fileHandle,
      bytes,
      fallbackName: name,
    })
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== file.id) return f
        const newFile = new File([bytes], f.file.name, {
          type: 'application/pdf',
        })
        return { ...f, file: newFile, buffer: bytes }
      }),
    )
  }, [])

  // Hidden <input> for "Open another" on browsers without the File
  // System Access API. Lives at App scope so the inline workspace
  // toolbars don't each need their own fallback input.
  const openAnotherInputRef = useRef(null)

  // "Open another" — used by the inline workspace toolbar so the user
  // can swap to a different PDF without leaving the editor view.
  // Returns an array of { file, fileHandle } the caller can pass to
  // addFiles. Empty array on cancel.
  const openAnotherPdf = useCallback(async () => {
    if (isFileSystemAccessSupported()) {
      try {
        return await openPdfFiles({ multiple: true })
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn(err)
        return []
      }
    }
    // Fallback: trigger the hidden <input>. We hand the result back via
    // its onChange handler, which calls a captured resolve(). This lets
    // the workspace `await` the picker on non-Chromium browsers too.
    return await new Promise((resolve) => {
      const input = openAnotherInputRef.current
      if (!input) return resolve([])
      const handler = (e) => {
        input.removeEventListener('change', handler)
        const list = Array.from(e.target.files || []).filter(
          (f) =>
            f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
        )
        e.target.value = ''
        resolve(list.map((file) => ({ file, fileHandle: null })))
      }
      input.addEventListener('change', handler)
      input.click()
    })
  }, [])

  // "Save As" for either workspace: ask the user where to write a new
  // file. On success, swap the workspace's file entry to the new handle
  // so subsequent Saves go there (matching Word's behavior). On
  // AbortError (user cancelled the picker) do nothing.
  const handleSaveAs = useCallback(async (file, bytes, opts = {}) => {
    const suggested =
      opts.suggestedName || `${baseName(file.file.name)}-edited.pdf`
    try {
      const { fileHandle: newHandle } = await saveAsPdf({
        bytes,
        suggestedName: suggested,
      })
      // If the browser doesn't support showSaveFilePicker, saveAsPdf
      // downloads and returns a null handle — leave the workspace's
      // file entry alone in that case (handle and name stay as they
      // were).
      if (!newHandle) return { savedInPlace: false }
      const newName =
        typeof newHandle.name === 'string' && newHandle.name
          ? newHandle.name
          : suggested
      const newFile = new File([bytes], newName, { type: 'application/pdf' })
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? {
                ...f,
                file: newFile,
                fileHandle: newHandle,
                buffer: bytes,
              }
            : f,
        ),
      )
      return { savedInPlace: true }
    } catch (err) {
      if (err?.name === 'AbortError') return { savedInPlace: false, cancelled: true }
      throw err
    }
  }, [])

  // Pick the file each workspace operates on. Multi-file workflows go
  // through the OperationPanel selector; workspaces just grab the first
  // ready file for now.
  const readyFiles = files.filter((f) => f.status === 'ready')
  const inFillFormMode = activeOp === 'fill-form' && readyFiles.length > 0
  const fillFormFile = inFillFormMode ? readyFiles[0] : null
  const inSignAndFillMode = activeOp === 'sign' && readyFiles.length > 0
  const signAndFillFile = inSignAndFillMode ? readyFiles[0] : null

  return (
    <div className="flex min-h-full flex-col bg-orange-50/40 dark:bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open tools menu"
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-slate-600 hover:bg-orange-50 hover:text-orange-600 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
            >
              {/* Hamburger glyph (CSS bars) */}
              <span aria-hidden="true" className="block h-0.5 w-5 bg-current" />
              <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-current" />
              <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-current" />
            </button>
            <a
              href="/"
              className="flex items-center gap-2 text-xl font-bold tracking-tight text-orange-600 dark:text-orange-400"
            >
              <span aria-hidden="true">📄</span> playPDF
            </a>
            {/* Value prop, always on screen so it stays visible even
                when we hide the per-workspace heading. Three bold
                pillars (free / private / offline) plus a softer
                supporting clause — keeps the bar slim but reads. */}
            <span className="hidden items-center gap-1.5 border-l border-orange-200 pl-3 text-xs sm:inline-flex dark:border-slate-700">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Free
              </span>
              <span className="text-orange-400 dark:text-orange-500" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Private
              </span>
              <span className="text-orange-400 dark:text-orange-500" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Works offline
              </span>
              <span className="hidden text-slate-400 dark:text-slate-500 md:inline">
                — files never leave your device
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {pwa.canInstall && (
              <button
                type="button"
                onClick={() => promptInstall()}
                title="Install playPDF as an app on this device — works offline, opens in its own window"
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-900/40"
              >
                <svg
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v12m0 0 4.5-4.5M12 16.5 7.5 12M4.5 19.5h15"
                  />
                </svg>
                Install
              </button>
            )}
            {pwa.installed && (
              <span
                title="playPDF is installed on this device."
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                ✓ Installed
              </span>
            )}
            <a
              href="https://patroventure.com"
              className="hidden text-sm font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 md:inline"
            >
              A PatroVenture project ↗
            </a>
          </div>
        </nav>
      </header>

      {/* Editor body: sidebar + main workspace. Full window width — the
          PDF needs the room, and capping it at max-w-7xl just adds
          visual whitespace people read as "the editor is small". */}
      <div className="relative flex w-full flex-1">
        {/* Sidebar — persistent on md+, drawer on mobile */}
        <aside
          aria-label="Tools"
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-orange-100 bg-white transition-transform duration-200 ease-out dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-[57px] md:z-10 md:h-[calc(100vh-57px)] md:w-56 md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <Sidebar
            activeOp={activeOp}
            onSelectOp={selectOp}
            busy={busy}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        {/* Mobile backdrop when drawer open */}
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}

        {/* Main workspace. Compact padding when a full-page workspace
            is active so the PDF gets the room — wider padding when
            browsing tools / picking a file. */}
        <main
          className={`min-w-0 flex-1 px-4 md:px-8 ${
            inFillFormMode || inSignAndFillMode
              ? 'py-3'
              : 'py-6 sm:py-8'
          }`}
        >
          {/* Heading only when we're NOT in a focused workspace — the
              tagline lives in the top nav permanently, so removing this
              here just reclaims vertical space without losing the
              messaging. */}
          {!inFillFormMode && !inSignAndFillMode && (
            <header className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                Free, private PDF editor
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Pick a tool from the sidebar. All processing happens in
                your browser — files never leave your device.
              </p>
            </header>
          )}

          {/* Persistent PDF upload — hidden when the active op brings
              its own input (Images → PDF) or owns a full-page workspace
              (Fill Form, Sign & Fill — those render file info inline in
              their own toolbar). Preview thumbnails are also hidden
              when a workspace owns full-size page rendering. */}
          {activeOp !== 'jpg-to-pdf' &&
            !inFillFormMode &&
            !inSignAndFillMode && (
              <>
                <FileUpload
                  files={files}
                  onAddFiles={addFiles}
                  onRemoveFile={removeFile}
                />
                <PagePreview files={files} />
              </>
            )}

          {inFillFormMode ? (
            <FillFormWorkspace
              key={fillFormFile.id}
              file={fillFormFile}
              busy={busy}
              onSelectOp={selectOp}
              onSaved={handleFillFormSave}
              onSaveAs={(bytes, opts) =>
                handleSaveAs(fillFormFile, bytes, {
                  suggestedName: `${baseName(fillFormFile.file.name)}-filled.pdf`,
                  ...opts,
                })
              }
              onRemoveFile={() => removeFile(fillFormFile.id)}
              onOpenAnother={async () => {
                const picked = await openAnotherPdf()
                if (picked.length) addFiles(picked)
              }}
            />
          ) : inSignAndFillMode ? (
            <SignAndFillWorkspace
              key={signAndFillFile.id}
              file={signAndFillFile}
              busy={busy}
              onSaved={handleSignAndFillSave}
              onSaveAs={(bytes, opts) =>
                handleSaveAs(signAndFillFile, bytes, {
                  suggestedName: `${baseName(signAndFillFile.file.name)}-signed.pdf`,
                  ...opts,
                })
              }
              onRemoveFile={() => removeFile(signAndFillFile.id)}
              onOpenAnother={async () => {
                const picked = await openAnotherPdf()
                if (picked.length) addFiles(picked)
              }}
            />
          ) : (
          <OperationPanel
            files={files}
            busy={busy}
            activeOp={activeOp}
            onMerge={handleMerge}
            onSplitRange={handleSplitRange}
            onSplitAll={handleSplitAll}
            onRotate={handleRotate}
            onReorder={handleReorder}
            onDelete={handleDelete}
            onImagesToPdf={handleImagesToPdf}
            onPdfToJpg={handlePdfToJpg}
            onRedact={handleRedact}
            onSignAndFill={handleSignAndFill}
            onInspectForm={handleInspectForm}
            onFillForm={handleFillForm}
            onSelectOp={selectOp}
            message={message}
            error={error}
            lastResult={lastResult}
            onUseResultAsInput={useResultAsInput}
          />
          )}

          {/* Marketing / SEO content — hidden in focused workspaces so
              the user isn't scrolling past it to reach Save buttons. */}
          {!inFillFormMode && !inSignAndFillMode && <InfoSections />}
        </main>
      </div>

      <PrivacyFooter />

      {/* Hidden fallback picker for "Open another" inside workspaces on
          browsers without the File System Access API. */}
      <input
        ref={openAnotherInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
      />
    </div>
  )
}
