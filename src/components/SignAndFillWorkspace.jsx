import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderAllPages } from '../services/pdfRenderService.js'
import { signAndFillPdf } from '../services/pdfService.js'
import SignatureCanvas from './SignatureCanvas.jsx'

const DRAG_THRESHOLD_PX = 3
const MIN_FONT_PX = 6
const MAX_FONT_PX = 72

let placementIdCounter = 0
const nextPlacementId = () => `p${++placementIdCounter}`

const clampFont = (n) =>
  Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, Math.round(Number(n) || 12)))

/**
 * Full-size Sign & Fill experience.
 *
 * Text mode: click anywhere on a page, an input drops in at the click
 * point, you type. Each text box has its own font-size +/− controls
 * and can be dragged from the handle above.
 *
 * Signature mode: draw your signature once, click to drop copies of it.
 *
 * Save is explicit (never auto): "Save" writes back to the original
 * file when opened with a handle, "Save As…" always picks a new file
 * so the original is never touched.
 */
export default function SignAndFillWorkspace({
  file,
  busy,
  onSaved,
  onSaveAs,
  onRemoveFile,
  onOpenAnother,
}) {
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [errMsg, setErrMsg] = useState('')
  const [pages, setPages] = useState([])
  const [tool, setTool] = useState('text') // 'text' | 'sig'
  const [signature, setSignature] = useState(null) // { bytes, dataUrl }
  const [sigWidthPct, setSigWidthPct] = useState(25)
  const [fontSize, setFontSize] = useState(12)
  const [placements, setPlacements] = useState({}) // { [pageIdx]: [{ id, kind, x, y, ... }] }

  const [saveState, setSaveState] = useState('idle') // idle | dirty | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [saveError, setSaveError] = useState('')

  const originalBytesRef = useRef(null)
  const genRef = useRef(0)
  // Set true right before our own Save / Save As triggers a setFiles
  // in App. The resulting file-prop change would normally re-fire the
  // load effect and clear placements (yanking the input the user is
  // typing into). We swallow exactly one re-fire so editing stays
  // unbroken across saves.
  const skipNextLoadRef = useRef(false)
  // ID of a freshly-added placement that should autofocus on next render.
  const [pendingFocusId, setPendingFocusId] = useState(null)

  const hasHandle = Boolean(file.fileHandle)

  // Load the PDF and render pages at workspace scale.
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    const gen = ++genRef.current
    setPhase('loading')
    setErrMsg('')
    setSaveState('idle')
    setSaveError('')
    setLastSavedAt(null)
    setPlacements({})

    const sourceBytesP = file.buffer
      ? Promise.resolve(file.buffer)
      : file.file.arrayBuffer().then((ab) => new Uint8Array(ab))

    sourceBytesP
      .then(async (bytes) => {
        if (gen !== genRef.current) return
        originalBytesRef.current = bytes.slice()
        const rendered = await renderAllPages(bytes, { scale: 2 })
        if (gen !== genRef.current) return
        setPages(rendered.pages)
        setPhase('ready')
      })
      .catch((err) => {
        if (gen !== genRef.current) return
        console.error(err)
        setErrMsg(err?.message || 'Could not open this PDF.')
        setPhase('error')
      })

  }, [file])

  // Bake current placements into a PDF buffer via signAndFillPdf.
  // Skips empty text placements (a click that placed an input but never
  // got typed into is just visual scaffolding, not a real edit).
  const bake = useCallback(async () => {
    const original = originalBytesRef.current
    if (!original) return null
    const out = {}
    for (const [k, items] of Object.entries(placements)) {
      const list = items
        .filter((it) => {
          if (it.kind === 'text') return it.text && it.text.length > 0
          if (it.kind === 'sig') return Boolean(it.png)
          return false
        })
        .map(({ id, dataUrl, ...rest }) => rest)
      if (list.length) out[k] = list
    }
    if (Object.keys(out).length === 0) return null
    return await signAndFillPdf(original, out)
  }, [placements])

  const saveNow = useCallback(async () => {
    setSaveState('saving')
    setSaveError('')
    try {
      const baked = await bake()
      const bytes = baked ?? originalBytesRef.current.slice()
      // Tell the load effect to ignore the file-prop change that
      // App's setFiles is about to cause — otherwise it'd remount
      // the workspace mid-edit.
      skipNextLoadRef.current = true
      await onSaved(file, bytes)
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (err) {
      console.error(err)
      setSaveError(err?.message || 'Save failed.')
      setSaveState('error')
    }
  }, [bake, file, onSaved])

  const saveAs = useCallback(async () => {
    if (!onSaveAs) return
    setSaveState('saving')
    setSaveError('')
    try {
      const baked = await bake()
      const bytes = baked ?? originalBytesRef.current.slice()
      // Save As also replaces the workspace's file entry (new handle,
      // new name) — same remount-avoidance dance as Save.
      skipNextLoadRef.current = true
      const res = await onSaveAs(bytes)
      if (res?.cancelled) {
        // Picker dismissed — restore prior state, keep edits.
        skipNextLoadRef.current = false
        setSaveState('dirty')
        return
      }
      setLastSavedAt(new Date())
      setSaveState('saved')
    } catch (err) {
      console.error(err)
      setSaveError(err?.message || 'Save As failed.')
      setSaveState('error')
    }
  }, [bake, onSaveAs])

  // Mark unsaved without scheduling a write — save is always explicit.
  const markDirty = useCallback(() => setSaveState('dirty'), [])

  // Click on a page background (not on an existing placement) adds a
  // new placement at the normalized coords.
  const onPagePlace = useCallback(
    (pageIdx, x, y) => {
      if (tool === 'text') {
        const id = nextPlacementId()
        setPlacements((prev) => ({
          ...prev,
          [pageIdx]: [
            ...(prev[pageIdx] || []),
            { id, kind: 'text', x, y, text: '', fontSize },
          ],
        }))
        setPendingFocusId(id)
        // No autosave yet — empty placement isn't baked.
      } else if (tool === 'sig') {
        if (!signature) return
        const id = nextPlacementId()
        setPlacements((prev) => ({
          ...prev,
          [pageIdx]: [
            ...(prev[pageIdx] || []),
            {
              id,
              kind: 'sig',
              x,
              y,
              width: sigWidthPct / 100,
              png: signature.bytes,
              dataUrl: signature.dataUrl,
            },
          ],
        }))
        markDirty()
      }
    },
    [tool, signature, sigWidthPct, fontSize, markDirty],
  )

  const updatePlacement = useCallback(
    (pageIdx, id, patch, { saveAfter = true } = {}) => {
      setPlacements((prev) => ({
        ...prev,
        [pageIdx]: (prev[pageIdx] || []).map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      }))
      if (saveAfter) markDirty()
    },
    [markDirty],
  )

  const removePlacement = useCallback(
    (pageIdx, id) => {
      setPlacements((prev) => {
        const next = { ...prev }
        const arr = (next[pageIdx] || []).filter((p) => p.id !== id)
        if (arr.length === 0) delete next[pageIdx]
        else next[pageIdx] = arr
        return next
      })
      markDirty()
    },
    [markDirty],
  )

  const revert = useCallback(() => {
    // Pure in-memory revert — drop placements, mark clean. Does NOT
    // write to disk; the saved file on disk only changes when the
    // user explicitly clicks Save (or Save As).
    setPlacements({})
    setSaveError('')
    setSaveState('idle')
  }, [])

  const totalPlacements = useMemo(
    () => Object.values(placements).reduce((s, arr) => s + arr.length, 0),
    [placements],
  )

  // Phase rendering ──────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Opening {file.file.name}…
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {errMsg}
      </div>
    )
  }

  const canPlace = tool === 'text' || (tool === 'sig' && Boolean(signature))

  return (
    <div>
      {/* Single-line workspace toolbar: file info + tool toggle + status
          + save controls. Tool-specific widgets (signature canvas, sig
          size slider) appear in a slim secondary row below ONLY when
          they're actually needed. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <FileChip
          file={file}
          hasHandle={hasHandle}
          onRemove={onRemoveFile}
          onOpenAnother={onOpenAnother}
        />
        <span className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" />
        <ToolToggle tool={tool} onChange={setTool} />
        {tool === 'text' && (
          <DefaultFontSizeControl value={fontSize} onChange={setFontSize} />
        )}
        <ToolbarStatus
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          saveError={saveError}
        />
        <SaveActions
          hasHandle={hasHandle}
          saveState={saveState}
          totalPlacements={totalPlacements}
          busy={busy}
          onSave={saveNow}
          onSaveAs={saveAs}
          onRevert={revert}
        />
      </div>

      {/* Sig mode: canvas (no signature yet) or sig controls (have one).
          Stays out of the main toolbar so the toolbar always fits one
          line. */}
      {tool === 'sig' && !signature && (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
          <SignatureCanvas disabled={busy} onSave={setSignature} />
        </div>
      )}
      {tool === 'sig' && signature && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900">
          <img
            src={signature.dataUrl}
            alt="Your signature"
            className="max-h-8 rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
          />
          <label className="font-medium text-slate-600 dark:text-slate-300">
            Size{' '}
            <span className="text-slate-400 dark:text-slate-500">
              ({sigWidthPct}%)
            </span>
            <input
              type="range"
              min={5}
              max={60}
              value={sigWidthPct}
              onChange={(e) => setSigWidthPct(Number(e.target.value))}
              className="ml-2 w-32 align-middle"
            />
          </label>
          <button
            type="button"
            onClick={() => setSignature(null)}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:text-slate-300"
          >
            Draw again
          </button>
          <span className="ml-auto text-slate-400 dark:text-slate-500">
            Click a page to drop your signature.
          </span>
        </div>
      )}

      {/* Pages */}
      <div className="flex flex-col items-center gap-4">
        {pages.map((page, i) => (
          <SignAndFillPage
            key={i}
            page={page}
            pageIdx={i}
            placements={placements[i] || []}
            canPlace={canPlace}
            tool={tool}
            pendingFocusId={pendingFocusId}
            onClearPendingFocus={() => setPendingFocusId(null)}
            onPlace={(x, y) => onPagePlace(i, x, y)}
            onUpdate={(id, patch, opts) => updatePlacement(i, id, patch, opts)}
            onRemove={(id) => removePlacement(i, id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

// ── Compact toolbar pieces ─────────────────────────────────────────────
// Each renders inline in the single-line workspace toolbar. Icons get
// native `title` tooltips so hover gives the full label.

function FileChip({ file, hasHandle, onRemove, onOpenAnother }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        className="truncate text-xs font-medium text-slate-800 dark:text-slate-100"
        title={file.file.name}
        style={{ maxWidth: '20ch' }}
      >
        📄 {file.file.name}
      </span>
      {hasHandle && (
        <span
          title="Opened with write access — Save will overwrite this file."
          className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        >
          rw
        </span>
      )}
      {onOpenAnother && (
        <button
          type="button"
          onClick={onOpenAnother}
          title="Open another PDF"
          aria-label="Open another PDF"
          className="rounded p-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-orange-600 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ＋
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Close this file"
          aria-label="Close this file"
          className="rounded p-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function ToolToggle({ tool, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Tool"
      className="inline-flex rounded border border-orange-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        role="radio"
        aria-checked={tool === 'text'}
        onClick={() => onChange('text')}
        title="Text — click a page to place a text box"
        aria-label="Text tool"
        className={`rounded px-2 py-0.5 text-sm leading-none transition-colors ${
          tool === 'text'
            ? 'bg-orange-600 text-white'
            : 'text-slate-600 hover:text-orange-600 dark:text-slate-300'
        }`}
      >
        ✏️
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={tool === 'sig'}
        onClick={() => onChange('sig')}
        title="Signature — draw once, click pages to stamp copies"
        aria-label="Signature tool"
        className={`rounded px-2 py-0.5 text-sm leading-none transition-colors ${
          tool === 'sig'
            ? 'bg-orange-600 text-white'
            : 'text-slate-600 hover:text-orange-600 dark:text-slate-300'
        }`}
      >
        ✍️
      </button>
    </div>
  )
}

function DefaultFontSizeControl({ value, onChange }) {
  return (
    <label
      className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"
      title="Font size for the NEXT text box you place. Existing boxes have their own per-box controls."
    >
      <span className="hidden md:inline">size</span>
      <input
        type="number"
        min={MIN_FONT_PX}
        max={MAX_FONT_PX}
        value={value}
        onChange={(e) => onChange(clampFont(e.target.value))}
        className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </label>
  )
}

function ToolbarStatus({ saveState, lastSavedAt, saveError }) {
  let text
  let cls = 'text-slate-500 dark:text-slate-400'
  if (saveError) {
    text = `⚠ ${saveError}`
    cls = 'text-red-600 dark:text-red-400'
  } else if (saveState === 'saving') text = 'Saving…'
  else if (saveState === 'dirty') text = 'Unsaved'
  else if (saveState === 'saved' && lastSavedAt)
    text = `Saved ${lastSavedAt.toLocaleTimeString()}`
  else text = ''
  return (
    <span
      className={`ml-auto min-w-0 truncate text-[11px] ${cls}`}
      title={text || 'No unsaved changes'}
    >
      {text}
    </span>
  )
}

function SaveActions({
  hasHandle,
  saveState,
  totalPlacements,
  busy,
  onSave,
  onSaveAs,
  onRevert,
}) {
  const saving = saveState === 'saving'
  const nothingToSave = totalPlacements === 0 && saveState !== 'dirty'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={busy || saving || nothingToSave}
        onClick={onSave}
        title={
          hasHandle
            ? 'Save (overwrite original file)'
            : 'Save & download a copy'
        }
        aria-label="Save"
        className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        💾<span className="ml-1 hidden md:inline">Save</span>
      </button>
      <button
        type="button"
        disabled={busy || saving || nothingToSave}
        onClick={onSaveAs}
        title="Save As… — write to a new file, leave the original untouched"
        aria-label="Save As"
        className="rounded border border-orange-300 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        📁<span className="ml-1 hidden md:inline">Save As</span>
      </button>
      <button
        type="button"
        disabled={busy || saving || totalPlacements === 0}
        onClick={onRevert}
        title="Discard unsaved placements"
        aria-label="Revert"
        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        ↩<span className="ml-1 hidden md:inline">Revert</span>
      </button>
    </div>
  )
}

function SignAndFillPage({
  page,
  pageIdx,
  placements,
  canPlace,
  tool,
  pendingFocusId,
  onClearPendingFocus,
  onPlace,
  onUpdate,
  onRemove,
}) {
  const boxRef = useRef(null)

  const onPageClick = (e) => {
    if (!canPlace) return
    // Ignore clicks that originated on a placement.
    if (e.target !== e.currentTarget && !e.target.dataset?.pageBackground) {
      return
    }
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onPlace(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  return (
    <figure className="w-full rounded border border-slate-200 bg-slate-50 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div
        ref={boxRef}
        onClick={onPageClick}
        className={`relative w-full overflow-hidden bg-white ${
          canPlace ? 'cursor-crosshair' : ''
        }`}
      >
        <img
          src={page.dataUrl}
          alt={`Page ${pageIdx + 1}`}
          draggable={false}
          data-page-background="true"
          className="block w-full select-none"
        />
        {placements.map((p) => (
          <Placement
            key={p.id}
            placement={p}
            boxRef={boxRef}
            shouldFocus={p.id === pendingFocusId}
            onFocused={onClearPendingFocus}
            onUpdate={(patch, opts) => onUpdate(p.id, patch, opts)}
            onRemove={() => onRemove(p.id)}
          />
        ))}
      </div>
      <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        Page {pageIdx + 1} · {placements.length} placement
        {placements.length === 1 ? '' : 's'}
      </figcaption>
    </figure>
  )
}

// A single placement (text input or signature image). Draggable from a
// handle on top-left; removable via X on top-right. Text placements
// expose an editable input centered in the body.
function Placement({
  placement,
  boxRef,
  shouldFocus,
  onFocused,
  onUpdate,
  onRemove,
}) {
  const inputRef = useRef(null)
  const dragStateRef = useRef(null)

  useEffect(() => {
    if (shouldFocus && inputRef.current) {
      inputRef.current.focus()
      onFocused?.()
    }
  }, [shouldFocus, onFocused])

  const startDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: placement.x,
      startY: placement.y,
      boxW: rect.width,
      boxH: rect.height,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {}
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
    window.addEventListener('pointercancel', onDragEnd)
  }

  const onDragMove = (e) => {
    const s = dragStateRef.current
    if (!s) return
    const dx = e.clientX - s.startClientX
    const dy = e.clientY - s.startClientY
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    s.moved = true
    const nx = Math.max(0, Math.min(1, s.startX + dx / s.boxW))
    const ny = Math.max(0, Math.min(1, s.startY + dy / s.boxH))
    // Live update without saving every frame; final save fires on pointer up.
    onUpdate({ x: nx, y: ny }, { saveAfter: false })
  }

  const onDragEnd = () => {
    const s = dragStateRef.current
    dragStateRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    window.removeEventListener('pointercancel', onDragEnd)
    if (s?.moved) {
      // Trigger a save-after-drag with no extra patch.
      onUpdate({}, { saveAfter: true })
    }
  }

  const style = {
    left: `${placement.x * 100}%`,
    top: `${placement.y * 100}%`,
  }

  if (placement.kind === 'text') {
    // Anchor the input itself at (x, y) so its first character lines up
    // with the same point the bake uses. Drag handle, font-size +/−,
    // and X button sit OUTSIDE the bounding box (negative offsets) so
    // they don't shift the visible text position. The shrink-wrapped
    // wrapper takes the input's natural width.
    const currentFont = clampFont(placement.fontSize)
    const bumpFont = (delta) =>
      onUpdate({ fontSize: clampFont(currentFont + delta) })
    return (
      <div
        className="absolute z-10 inline-block shadow-sm"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top toolbar above the input: drag handle + font size +/− */}
        <div className="absolute -top-4 left-0 z-10 flex items-stretch gap-0.5">
          <button
            type="button"
            aria-label="Drag placement"
            onPointerDown={startDrag}
            className="flex h-4 w-8 cursor-grab items-center justify-center rounded-t border border-b-0 border-orange-500/70 bg-orange-100 text-[9px] leading-none text-orange-700 active:cursor-grabbing dark:bg-orange-900/50 dark:text-orange-200"
            title="Drag to move"
          >
            ⋮⋮
          </button>
          <button
            type="button"
            aria-label="Decrease font size"
            onClick={(e) => {
              e.stopPropagation()
              bumpFont(-2)
            }}
            disabled={currentFont <= MIN_FONT_PX}
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-t border border-b-0 border-orange-500/70 bg-orange-50 text-[10px] font-bold leading-none text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-orange-900/30 dark:text-orange-200"
            title="Smaller text"
          >
            −
          </button>
          <span
            className="flex h-4 min-w-[2.25rem] items-center justify-center rounded-t border border-b-0 border-orange-500/70 bg-orange-50 px-1 text-[9px] leading-none text-orange-700 dark:bg-orange-900/30 dark:text-orange-200"
            title="Font size (px)"
          >
            {currentFont}px
          </span>
          <button
            type="button"
            aria-label="Increase font size"
            onClick={(e) => {
              e.stopPropagation()
              bumpFont(2)
            }}
            disabled={currentFont >= MAX_FONT_PX}
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-t border border-b-0 border-orange-500/70 bg-orange-50 text-[10px] font-bold leading-none text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-orange-900/30 dark:text-orange-200"
            title="Larger text"
          >
            ＋
          </button>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={placement.text || ''}
          placeholder="type…"
          onChange={(e) => onUpdate({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !placement.text) {
              e.preventDefault()
              onRemove()
            }
          }}
          className="block border border-orange-500/70 bg-yellow-50/95 text-slate-900 outline-none focus:bg-yellow-100"
          style={{
            fontSize: `${currentFont}px`,
            minWidth: '8ch',
            padding: 0,
          }}
        />
        <button
          type="button"
          aria-label="Remove placement"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="absolute -top-2 -right-2 z-10 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-orange-500/70 bg-orange-100 text-[10px] leading-none text-orange-700 shadow hover:bg-red-200 hover:text-red-800 dark:bg-orange-900/50 dark:text-orange-200"
          title="Remove"
        >
          ✕
        </button>
      </div>
    )
  }

  // Signature placement: image, sized to placement.width fraction of page.
  return (
    <div
      className="absolute z-10 shadow-sm"
      style={{ ...style, width: `${(placement.width || 0.25) * 100}%` }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={startDrag}
    >
      <img
        src={placement.dataUrl}
        alt="Signature placement"
        className="block w-full cursor-grab active:cursor-grabbing"
        draggable={false}
      />
      <button
        type="button"
        aria-label="Remove placement"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs text-slate-700 shadow hover:bg-red-50 hover:text-red-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        title="Remove"
      >
        ✕
      </button>
    </div>
  )
}
