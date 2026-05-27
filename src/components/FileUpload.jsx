import { useCallback, useRef, useState } from 'react'
import { isFileSystemAccessSupported, openPdfFiles } from '../services/fileAccess.js'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const isPdf = (file) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

/**
 * Word-style "Open a PDF" picker.
 *
 * Empty state shows a centered Open CTA. With files, collapses to a slim
 * "Open another" button above the file list. Drag-and-drop still works
 * but isn't the headline — nothing here implies an upload to a server.
 *
 * Uses the File System Access API where supported (so the chosen file
 * keeps a writable handle and ops can Save back to disk). Falls back to
 * a plain <input type="file"> on Firefox/Safari, and drag-and-drop
 * always works (drops never give us a handle — that's a browser limit).
 */
export default function FileUpload({ files, onAddFiles, onRemoveFile }) {
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)
  // Re-entry guard: showOpenFilePicker fails noisily ("already showing a
  // file picker") if called twice in flight, and even when it doesn't,
  // the user sees two dialogs back-to-back. Block subsequent clicks
  // until the current pick resolves.
  const pickingRef = useRef(false)
  const supportsFsa = isFileSystemAccessSupported()

  const handleFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList).filter(isPdf)
      if (incoming.length) onAddFiles(incoming.map((file) => ({ file })))
    },
    [onAddFiles],
  )

  const openWithPicker = useCallback(async () => {
    if (pickingRef.current) return
    pickingRef.current = true
    try {
      const picked = await openPdfFiles({ multiple: true })
      if (picked.length) onAddFiles(picked)
    } catch (err) {
      // AbortError = user cancelled. Other errors mean the API itself
      // refused (security context, permissions). Log and stop — don't
      // open a second dialog via the <input> fallback, that's surprising.
      if (err?.name !== 'AbortError') {
        console.warn('showOpenFilePicker failed:', err)
      }
    } finally {
      pickingRef.current = false
    }
  }, [onAddFiles])

  const openWithInput = useCallback(() => {
    if (pickingRef.current) return
    pickingRef.current = true
    inputRef.current?.click()
    // The picker is modal; the next user gesture closes it. Reset the
    // flag a tick later — any duplicate synthetic click in the same
    // event loop is blocked, but real follow-up clicks work.
    setTimeout(() => {
      pickingRef.current = false
    }, 0)
  }, [])

  const openPicker = useCallback(() => {
    if (supportsFsa) openWithPicker()
    else openWithInput()
  }, [supportsFsa, openWithPicker, openWithInput])

  const onDrop = useCallback(
    (e) => {
      e.preventDefault()
      setDragActive(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback(() => setDragActive(false), [])

  return (
    <section>
      {files.length === 0 ? (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border px-6 py-10 text-center transition-colors ${
            dragActive
              ? 'border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-950/30'
              : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
          }`}
        >
          <svg
            className="mb-3 h-10 w-10 text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
            />
          </svg>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Open a PDF to start editing
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {supportsFsa
              ? 'Opens from your computer · saves back in place · never leaves your device'
              : 'Opens from your computer · never leaves your device'}
          </p>
          <button
            type="button"
            onClick={openPicker}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 9.75 5.25 18a2.25 2.25 0 0 0 2.236 2H16.5a2.25 2.25 0 0 0 2.236-2l1.514-8.25M3.75 9.75h16.5M3.75 9.75V6.75A2.25 2.25 0 0 1 6 4.5h3.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.75"
              />
            </svg>
            Open
          </button>
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
            or drag a PDF anywhere on this panel
          </p>
        </div>
      ) : (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`overflow-hidden rounded-lg border bg-white dark:bg-slate-900 ${
            dragActive
              ? 'border-orange-500 dark:border-orange-400'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {files.length} file{files.length === 1 ? '' : 's'} open
            </span>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-slate-800"
            >
              <span aria-hidden="true">＋</span>
              Open another
            </button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {f.file.name}
                    {f.fileHandle && (
                      <span
                        title="This file was opened with write access — Save will write back to it."
                        className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      >
                        saveable
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {formatBytes(f.file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFile(f.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
                  aria-label={`Remove ${f.file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Fallback <input> lives outside the dropzone so its clicks can't
          interleave with the dropzone's click handler. */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}
