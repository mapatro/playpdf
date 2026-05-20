import { useCallback, useEffect, useState } from 'react'
import { renderThumbnails } from '../services/pdfRenderService.js'

const OPERATIONS = [
  { id: 'merge', label: 'Merge' },
  { id: 'split', label: 'Split' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'reorder', label: 'Reorder' },
  { id: 'delete', label: 'Delete' },
]

/**
 * Operations panel. Merge keeps its multi-file behaviour. Split / Rotate /
 * Reorder operate on a SINGLE selected file (chosen via a dropdown when
 * more than one PDF is loaded). Everything runs 100% client-side.
 */
export default function OperationPanel({
  files,
  busy,
  activeOp,
  onSelectOp,
  onMerge,
  onSplitRange,
  onSplitAll,
  onRotate,
  onReorder,
  onDelete,
  message,
  error,
}) {
  const fileCount = files.length
  const canMerge = fileCount >= 2 && !busy
  const readyFiles = files.filter((f) => f.status === 'ready')

  const [selectedId, setSelectedId] = useState('')

  // Keep a valid selected single-file target.
  useEffect(() => {
    if (readyFiles.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!readyFiles.some((f) => f.id === selectedId)) {
      setSelectedId(readyFiles[0].id)
    }
  }, [readyFiles, selectedId])

  const selectedFile = readyFiles.find((f) => f.id === selectedId) || null

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Operations</h2>
      <div className="flex flex-wrap gap-3">
        {OPERATIONS.map((op) => {
          const isActive = activeOp === op.id
          return (
            <button
              key={op.id}
              type="button"
              onClick={() => onSelectOp(op.id)}
              disabled={busy}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                isActive
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'border border-orange-200 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-orange-400'
              }`}
            >
              {op.label}
            </button>
          )
        })}
      </div>

      {activeOp === 'merge' && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onMerge}
            disabled={!canMerge}
            className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
          >
            {busy ? 'Merging…' : 'Merge all files'}
          </button>
          {fileCount < 2 && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Add at least 2 PDFs to enable Merge.
            </p>
          )}
        </div>
      )}

      {(activeOp === 'split' ||
        activeOp === 'rotate' ||
        activeOp === 'reorder' ||
        activeOp === 'delete') && (
        <SingleFileOps
          op={activeOp}
          readyFiles={readyFiles}
          selectedId={selectedId}
          onSelectFile={setSelectedId}
          selectedFile={selectedFile}
          busy={busy}
          onSplitRange={onSplitRange}
          onSplitAll={onSplitAll}
          onRotate={onRotate}
          onReorder={onReorder}
          onDelete={onDelete}
        />
      )}

      {message && (
        <p className="mt-4 text-sm font-medium text-green-600">{message}</p>
      )}
      {error && (
        <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
      )}
    </section>
  )
}

function SingleFileOps({
  op,
  readyFiles,
  selectedId,
  onSelectFile,
  selectedFile,
  busy,
  onSplitRange,
  onSplitAll,
  onRotate,
  onReorder,
  onDelete,
}) {
  if (readyFiles.length === 0) {
    return (
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Add a PDF (and wait for its preview) to use this operation.
      </p>
    )
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <label className="mb-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
        Operate on file:
        <select
          value={selectedId}
          onChange={(e) => onSelectFile(e.target.value)}
          disabled={busy}
          className="ml-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-slate-800 dark:text-slate-100"
        >
          {readyFiles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.file.name} ({f.pageCount} pp)
            </option>
          ))}
        </select>
      </label>

      {selectedFile && op === 'split' && (
        <SplitPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onSplitRange={onSplitRange}
          onSplitAll={onSplitAll}
        />
      )}
      {selectedFile && op === 'rotate' && (
        <RotatePanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onRotate={onRotate}
        />
      )}
      {selectedFile && op === 'reorder' && (
        <ReorderPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onReorder={onReorder}
        />
      )}
      {selectedFile && op === 'delete' && (
        <DeletePanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

function DeletePanel({ file, busy, onDelete }) {
  const pageCount = file.pageCount || 1
  const { thumbs, loading, err } = useAllThumbnails(file)
  // 0-based indices marked for deletion.
  const [marked, setMarked] = useState(() => new Set())

  const toggle = (i) =>
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const clear = () => setMarked(new Set())
  const apply = () => onDelete(file, [...marked].sort((a, b) => a - b))

  const count = marked.size
  const wouldEmpty = count >= pageCount

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || count === 0 || wouldEmpty}
          onClick={apply}
          className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          {busy
            ? 'Working…'
            : count === 0
              ? 'Pick pages to delete'
              : `Delete ${count} page${count === 1 ? '' : 's'} & Download`}
        </button>
        <button
          type="button"
          disabled={busy || count === 0}
          onClick={clear}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Clear selection
        </button>
        <span className="self-center text-[11px] text-slate-400 dark:text-slate-500">
          Click a page to mark / unmark it.
        </span>
      </div>
      {wouldEmpty && (
        <p className="mb-2 text-xs text-red-500 dark:text-red-400">
          You can't delete every page — unmark at least one.
        </p>
      )}

      {loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Rendering all pages…
        </p>
      )}
      {err && <p className="text-xs text-red-500 dark:text-red-400">{err}</p>}

      {thumbs && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {thumbs.map((src, i) => {
            const isMarked = marked.has(i)
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                disabled={busy}
                aria-pressed={isMarked}
                className={`relative flex flex-col items-center rounded border p-2 transition-colors ${
                  isMarked
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 hover:border-orange-400'
                }`}
              >
                <div className="flex h-28 w-full items-center justify-center overflow-hidden">
                  <img
                    src={src}
                    alt={`Page ${i + 1}`}
                    className={`max-h-28 w-auto object-contain shadow-sm transition-opacity ${
                      isMarked ? 'opacity-40' : ''
                    }`}
                  />
                </div>
                <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  p{i + 1} · {isMarked ? 'delete' : 'keep'}
                </figcaption>
                {isMarked && (
                  <span className="absolute right-1 top-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    ✕
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SplitPanel({ file, busy, onSplitRange, onSplitAll }) {
  const pageCount = file.pageCount || 1
  // Mutually exclusive modes so the user can never accidentally trigger
  // 'split every page' while trying to extract a range.
  const [mode, setMode] = useState('range')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(pageCount)

  const clamp = (v) => {
    const n = Number.parseInt(v, 10)
    if (Number.isNaN(n)) return 1
    return Math.min(Math.max(n, 1), pageCount)
  }

  const validRange =
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    to <= pageCount &&
    from <= to

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
        This PDF has {pageCount} page{pageCount === 1 ? '' : 's'}.
      </p>

      {/* Segmented mode toggle — only one action is offered at a time. */}
      <div
        role="radiogroup"
        aria-label="Split mode"
        className="mb-4 inline-flex rounded-lg border border-orange-200 bg-white dark:bg-slate-900 p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'range'}
          disabled={busy}
          onClick={() => setMode('range')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'range'
              ? 'bg-orange-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-orange-600'
          }`}
        >
          Extract a page range
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'all'}
          disabled={busy}
          onClick={() => setMode('all')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'all'
              ? 'bg-orange-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-orange-600'
          }`}
        >
          Split every page into separate files
        </button>
      </div>

      {mode === 'range' && (
        <div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Extract pages <strong>From – To</strong> (inclusive) into one new PDF.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              From
              <input
                type="number"
                min={1}
                max={pageCount}
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(clamp(e.target.value))}
                className="mt-1 block w-20 rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              To
              <input
                type="number"
                min={1}
                max={pageCount}
                value={to}
                disabled={busy}
                onChange={(e) => setTo(clamp(e.target.value))}
                className="mt-1 block w-20 rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !validRange}
              onClick={() => onSplitRange(file, from, to)}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
            >
              {busy ? 'Working…' : `Extract pages ${from}–${to}`}
            </button>
          </div>
          {!validRange && (
            <p className="mt-2 text-xs text-red-500">
              Range must satisfy 1 ≤ From ≤ To ≤ {pageCount}.
            </p>
          )}
        </div>
      )}

      {mode === 'all' && (
        <div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Splits every page into its own single-page PDF and bundles them
            into a <code>.zip</code>. This <strong>ignores</strong> any
            range — use “Extract a page range” instead if you only want some
            pages.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSplitAll(file)}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
          >
            {busy
              ? 'Working…'
              : `Split all ${pageCount} page${pageCount === 1 ? '' : 's'} (.zip)`}
          </button>
        </div>
      )}
    </div>
  )
}

// Lazily/sequentially render every page as a thumbnail for the selected file.
function useAllThumbnails(file) {
  const [thumbs, setThumbs] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    setThumbs(null)
    setErr('')
    if (!file?.buffer) return
    setLoading(true)
    renderThumbnails(file.buffer, { maxPages: file.pageCount || 1 })
      .then((res) => {
        if (!cancelled) setThumbs(res.thumbnails)
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || 'Failed to render pages.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  return { thumbs, loading, err }
}

function RotatePanel({ file, busy, onRotate }) {
  const pageCount = file.pageCount || 1
  const { thumbs, loading, err } = useAllThumbnails(file)
  // Per-page accumulated angle (0/90/180/270).
  const [angles, setAngles] = useState(() => Array(pageCount).fill(0))

  const norm = (a) => ((a % 360) + 360) % 360
  const rotateOne = (i) =>
    setAngles((prev) => prev.map((v, idx) => (idx === i ? norm(v + 90) : v)))
  const rotateAll = (delta) =>
    setAngles((prev) => prev.map((v) => norm(v + delta)))

  const apply = () => {
    const rotations = {}
    angles.forEach((a, i) => {
      if (a) rotations[i] = a
    })
    onRotate(file, rotations)
  }

  const anyRotation = angles.some((a) => a !== 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => rotateAll(90)}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Rotate all 90°
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => rotateAll(180)}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Rotate all 180°
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => rotateAll(270)}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Rotate all 270°
        </button>
        <button
          type="button"
          disabled={busy || !anyRotation}
          onClick={apply}
          className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          {busy ? 'Working…' : 'Apply & Download'}
        </button>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Rendering all pages…</p>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}

      {thumbs && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {thumbs.map((src, i) => (
            <figure
              key={i}
              className="flex flex-col items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2"
            >
              <div className="flex h-28 w-full items-center justify-center overflow-hidden">
                <img
                  src={src}
                  alt={`Page ${i + 1}`}
                  style={{ transform: `rotate(${angles[i]}deg)` }}
                  className="max-h-28 w-auto object-contain shadow-sm transition-transform"
                />
              </div>
              <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                p{i + 1} · {angles[i]}°
              </figcaption>
              <button
                type="button"
                disabled={busy}
                onClick={() => rotateOne(i)}
                className="mt-1 rounded bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-60"
              >
                Rotate 90°
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}

function ReorderPanel({ file, busy, onReorder }) {
  const pageCount = file.pageCount || 1
  const { thumbs, loading, err } = useAllThumbnails(file)
  // order[i] = original 0-based page index now at slot i.
  const [order, setOrder] = useState(() =>
    Array.from({ length: pageCount }, (_, i) => i),
  )
  const [dragIndex, setDragIndex] = useState(null)

  const onDragStart = (slot) => setDragIndex(slot)
  const onDrop = (slot) => {
    if (dragIndex === null || dragIndex === slot) return
    setOrder((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(slot, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  const reset = () =>
    setOrder(Array.from({ length: pageCount }, (_, i) => i))
  const changed = order.some((v, i) => v !== i)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !changed}
          onClick={() => onReorder(file, order)}
          className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          {busy ? 'Working…' : 'Apply & Download'}
        </button>
        <button
          type="button"
          disabled={busy || !changed}
          onClick={reset}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Reset order
        </button>
        <span className="self-center text-[11px] text-slate-400 dark:text-slate-500">
          Drag thumbnails to reorder.
        </span>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Rendering all pages…</p>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}

      {thumbs && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {order.map((origIdx, slot) => (
            <figure
              key={origIdx}
              draggable={!busy}
              onDragStart={() => onDragStart(slot)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(slot)}
              className={`flex cursor-move flex-col items-center rounded border bg-slate-50 dark:bg-slate-800 p-2 ${
                dragIndex === slot
                  ? 'border-orange-500'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex h-28 w-full items-center justify-center overflow-hidden">
                <img
                  src={thumbs[origIdx]}
                  alt={`Page ${origIdx + 1}`}
                  className="max-h-28 w-auto object-contain shadow-sm"
                  draggable={false}
                />
              </div>
              <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                slot {slot + 1} · orig p{origIdx + 1}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
