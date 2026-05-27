import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import { inspectForm } from '../services/pdfService.js'
import { renderAllPages } from '../services/pdfRenderService.js'

/**
 * Full-size in-place fill experience for AcroForm PDFs.
 *
 * Save is explicit: "Save" writes back to the original file (when
 * opened with a handle) or downloads a -filled copy; "Save As…"
 * always asks where to write a new file so the original is never
 * touched. There is no autosave.
 *
 * The component owns:
 *   • An in-memory PDFDocument so each keystroke just mutates one field
 *     rather than re-parsing the whole PDF.
 *   • Inspected field geometry (page, x, y, width, height in [0,1]).
 *   • Rendered page bitmaps.
 *   • A snapshot of the bytes at mount, for Revert.
 */
export default function FillFormWorkspace({
  file,
  busy,
  onSelectOp,
  onSaved,
  onSaveAs,
  onRemoveFile,
  onOpenAnother,
}) {
  const [phase, setPhase] = useState('loading') // 'loading' | 'ready' | 'noFields' | 'error'
  const [errMsg, setErrMsg] = useState('')
  const [fields, setFields] = useState([]) // from inspectForm
  const [pages, setPages] = useState([]) // [{ dataUrl, width, height }]
  const [values, setValues] = useState({}) // { [fieldName]: value }
  const [flatten, setFlatten] = useState(false)
  const [saveState, setSaveState] = useState('idle') // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [saveError, setSaveError] = useState('')

  // pdf-lib doc kept across edits so each setText is cheap.
  const docRef = useRef(null)
  // Original bytes for Revert.
  const originalBytesRef = useRef(null)
  // Cancel guards for inspect + render fetches.
  const generationRef = useRef(0)
  // Set true right before our own Save / Save As triggers a setFiles
  // in App. Otherwise the resulting file-prop change re-fires the load
  // effect, which re-parses everything and yanks the input the user
  // was typing into. Swallow exactly one re-fire to keep editing smooth.
  const skipNextLoadRef = useRef(false)

  const hasHandle = Boolean(file.fileHandle)

  // Load: inspect fields, render pages, seed PDFDocument.
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    const gen = ++generationRef.current
    setPhase('loading')
    setErrMsg('')
    setSaveState('idle')
    setSaveError('')
    setLastSavedAt(null)

    const sourceBytesPromise = file.buffer
      ? Promise.resolve(file.buffer)
      : file.file.arrayBuffer().then((ab) => new Uint8Array(ab))

    sourceBytesPromise
      .then(async (bytes) => {
        if (gen !== generationRef.current) return
        originalBytesRef.current = bytes.slice()

        const [inspected, rendered, doc] = await Promise.all([
          inspectForm(bytes),
          renderAllPages(bytes, { scale: 2 }),
          PDFDocument.load(bytes),
        ])
        if (gen !== generationRef.current) return

        if (!inspected || inspected.length === 0) {
          setFields([])
          setPages(rendered.pages)
          setPhase('noFields')
          return
        }

        docRef.current = doc
        setFields(inspected)
        setPages(rendered.pages)

        const seed = {}
        for (const f of inspected) {
          if (seed[f.name] !== undefined) continue
          if (f.type === 'text' && typeof f.value === 'string') seed[f.name] = f.value
          else if (f.type === 'checkbox') seed[f.name] = !!f.value
          else if (f.type === 'radio' || f.type === 'dropdown') seed[f.name] = f.value ?? ''
          else if (f.type === 'listbox') seed[f.name] = Array.isArray(f.value) ? f.value : []
        }
        setValues(seed)
        setPhase('ready')
      })
      .catch((err) => {
        if (gen !== generationRef.current) return
        console.error(err)
        setErrMsg(err?.message || 'Could not open this PDF.')
        setPhase('error')
      })

  }, [file])

  // Group fields by page index for overlay rendering.
  const fieldsByPage = useMemo(() => {
    const acc = {}
    for (const f of fields) (acc[f.page] ||= []).push(f)
    return acc
  }, [fields])

  // Apply a single field edit to the in-memory PDFDocument.
  const applyToDoc = useCallback((field, raw) => {
    const doc = docRef.current
    if (!doc) return
    try {
      const form = doc.getForm()
      const pdfField = form.getField(field.name)
      if (field.type === 'text') pdfField.setText(raw ?? '')
      else if (field.type === 'checkbox') {
        if (raw) pdfField.check()
        else pdfField.uncheck()
      } else if (field.type === 'radio' || field.type === 'dropdown') {
        if (raw === '' || raw == null) {
          // pdf-lib has no clear-selection API on these; leaving as-is is fine.
        } else {
          pdfField.select(raw)
        }
      } else if (field.type === 'listbox') {
        const arr = Array.isArray(raw) ? raw : []
        if (arr.length > 0) pdfField.select(arr)
      }
    } catch (err) {
      console.warn(`Couldn't set field "${field.name}":`, err)
    }
  }, [])

  // Serialize the doc and hand the bytes to App.jsx (which decides whether
  // to write to the handle or download).
  const saveNow = useCallback(
    async ({ flatten: doFlatten = false } = {}) => {
      const doc = docRef.current
      if (!doc) return
      setSaveState('saving')
      setSaveError('')
      try {
        const form = doc.getForm()
        form.updateFieldAppearances()
        if (doFlatten) form.flatten()
        const bytes = await doc.save()
        // Flatten changes the field set — we want the full reload to
        // re-inspect (no more fields) and re-render. For plain saves,
        // skip the load effect to avoid mid-edit remount.
        if (!doFlatten) skipNextLoadRef.current = true
        await onSaved(file, bytes, { flatten: doFlatten })
        setLastSavedAt(new Date())
        setSaveState('saved')
        if (doFlatten) {
          // Doc is now flattened — further edits are stamped on, not interactive.
          // Reload a fresh document from the just-saved bytes so subsequent
          // edits go through the (now empty) form set without errors.
          docRef.current = await PDFDocument.load(bytes)
          setFields([])
          setPhase('noFields')
        }
      } catch (err) {
        console.error(err)
        if (err?.name === 'NotAllowedError') {
          setSaveError('Lost write access to the file. Future saves will download.')
          // The handle is effectively dead — let App.jsx know? Easiest:
          // user reopens. For now just stop trying.
        } else {
          setSaveError(err?.message || 'Save failed.')
        }
        setSaveState('error')
      }
    },
    [file, onSaved],
  )

  // Save is always explicit — typing just marks the workspace dirty.
  const markDirty = useCallback(() => setSaveState('dirty'), [])

  // "Save As…" — bake current doc and hand bytes to App, which calls
  // showSaveFilePicker. Same remount-avoidance trick as Save.
  const saveAs = useCallback(async () => {
    const doc = docRef.current
    if (!doc || !onSaveAs) return
    setSaveState('saving')
    setSaveError('')
    try {
      const form = doc.getForm()
      form.updateFieldAppearances()
      const bytes = await doc.save()
      skipNextLoadRef.current = true
      const res = await onSaveAs(bytes)
      if (res?.cancelled) {
        // User dismissed the picker — keep edits, restore dirty state.
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
  }, [onSaveAs])

  const setOne = useCallback(
    (field, v) => {
      setValues((prev) => ({ ...prev, [field.name]: v }))
      applyToDoc(field, v)
      markDirty()
    },
    [applyToDoc, markDirty],
  )

  const revert = useCallback(async () => {
    const bytes = originalBytesRef.current
    if (!bytes) return
    // Pure in-memory revert — reset the doc and reseed values from the
    // original bytes. Does NOT touch disk; the saved file only changes
    // when the user explicitly clicks Save (or Save As).
    setSaveState('saving')
    setSaveError('')
    try {
      docRef.current = await PDFDocument.load(bytes.slice())
      const inspected = await inspectForm(bytes.slice())
      const seed = {}
      for (const f of inspected || []) {
        if (seed[f.name] !== undefined) continue
        if (f.type === 'text' && typeof f.value === 'string') seed[f.name] = f.value
        else if (f.type === 'checkbox') seed[f.name] = !!f.value
        else if (f.type === 'radio' || f.type === 'dropdown') seed[f.name] = f.value ?? ''
        else if (f.type === 'listbox') seed[f.name] = Array.isArray(f.value) ? f.value : []
      }
      setValues(seed)
      setSaveState('idle')
    } catch (err) {
      console.error(err)
      setSaveError(err?.message || 'Revert failed.')
      setSaveState('error')
    }
  }, [])

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

  if (phase === 'noFields') {
    return (
      <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <p className="mb-3">
          This PDF has no built-in form fields — it's a flattened,
          word-processor-exported or scan-style PDF. Use{' '}
          <strong>Sign &amp; Fill</strong> to type or sign anywhere on the
          page instead.
        </p>
        {onSelectOp && (
          <button
            type="button"
            onClick={() => onSelectOp('sign')}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700"
          >
            ✍️ Switch to Sign &amp; Fill
          </button>
        )}
      </div>
    )
  }

  // Fully ready: render workspace.
  const totalFields = fields.length

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">
      {/* Pages column */}
      <div className="min-w-0">
        <SaveStatusBar
          file={file}
          hasHandle={hasHandle}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          saveError={saveError}
          busy={busy}
          onSave={() => saveNow({ flatten: false })}
          onSaveAs={saveAs}
          onFlattenAndSave={() => saveNow({ flatten: true })}
          onRevert={revert}
          flatten={flatten}
          onFlattenChange={setFlatten}
          onRemoveFile={onRemoveFile}
          onOpenAnother={onOpenAnother}
        />

        <div className="flex flex-col items-center gap-4">
          {pages.map((page, i) => (
            <FillFormPage
              key={i}
              page={page}
              pageIdx={i}
              fields={fieldsByPage[i] || []}
              values={values}
              busy={busy}
              onChange={setOne}
            />
          ))}
        </div>
      </div>

      {/* Field list sidebar */}
      <aside className="sticky top-20 hidden h-[calc(100vh-7rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 md:block">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {totalFields} field{totalFields === 1 ? '' : 's'}
        </h3>
        <ul className="space-y-1 text-xs">
          {fields.map((f, i) => (
            <FieldListItem
              key={`${f.name}-${i}`}
              field={f}
              value={values[f.name]}
            />
          ))}
        </ul>
      </aside>
    </div>
  )
}

// Single-line workspace toolbar: file chip + status + Save/SaveAs/Flatten/Revert.
function SaveStatusBar({
  file,
  hasHandle,
  saveState,
  lastSavedAt,
  saveError,
  busy,
  onSave,
  onSaveAs,
  onFlattenAndSave,
  onRevert,
  flatten,
  onFlattenChange,
  onRemoveFile,
  onOpenAnother,
}) {
  const saving = saveState === 'saving'

  let statusText = ''
  let statusCls = 'text-slate-500 dark:text-slate-400'
  if (saveError) {
    statusText = `⚠ ${saveError}`
    statusCls = 'text-red-600 dark:text-red-400'
  } else if (saving) statusText = 'Saving…'
  else if (saveState === 'dirty') statusText = 'Unsaved'
  else if (saveState === 'saved' && lastSavedAt)
    statusText = `Saved ${lastSavedAt.toLocaleTimeString()}`

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
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
        {onRemoveFile && (
          <button
            type="button"
            onClick={onRemoveFile}
            title="Close this file"
            aria-label="Close this file"
            className="rounded p-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        )}
      </div>
      <span className="mx-1 hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" />
      <label
        className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300"
        title="Bake field values into the page so the PDF has no editable form afterwards."
      >
        <input
          type="checkbox"
          checked={flatten}
          onChange={(e) => onFlattenChange(e.target.checked)}
        />
        <span className="hidden md:inline">Flatten on save</span>
        <span className="md:hidden">Flat</span>
      </label>
      <span
        className={`ml-auto min-w-0 truncate text-[11px] ${statusCls}`}
        title={statusText || 'No unsaved changes'}
      >
        {statusText}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy || saving}
          onClick={flatten ? onFlattenAndSave : onSave}
          title={
            flatten
              ? 'Flatten & Save (recipients can no longer edit the fields)'
              : hasHandle
                ? 'Save (overwrite original file)'
                : 'Save & download a filled copy'
          }
          aria-label={flatten ? 'Flatten and Save' : 'Save'}
          className="rounded bg-orange-600 px-2 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {flatten ? '🔒' : '💾'}
          <span className="ml-1 hidden md:inline">
            {flatten ? 'Flatten & Save' : 'Save'}
          </span>
        </button>
        <button
          type="button"
          disabled={busy || saving}
          onClick={onSaveAs}
          title="Save As… — write to a new file, leave the original untouched"
          aria-label="Save As"
          className="rounded border border-orange-300 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          📁<span className="ml-1 hidden md:inline">Save As</span>
        </button>
        <button
          type="button"
          disabled={busy || saving}
          onClick={onRevert}
          title="Discard in-memory edits and restore the original values. Does not touch disk."
          aria-label="Revert"
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          ↩<span className="ml-1 hidden md:inline">Revert</span>
        </button>
      </div>
    </div>
  )
}

// A single rendered page with overlaid editable fields.
function FillFormPage({ page, pageIdx, fields, values, busy, onChange }) {
  return (
    <figure className="w-full rounded border border-slate-200 bg-slate-50 p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="relative w-full overflow-hidden bg-white">
        <img
          src={page.dataUrl}
          alt={`Page ${pageIdx + 1}`}
          draggable={false}
          className="block w-full select-none"
        />
        {fields.map((f, i) => (
          <FieldInput
            key={`${f.name}-${i}`}
            field={f}
            value={values[f.name]}
            busy={busy}
            onChange={(v) => onChange(f, v)}
          />
        ))}
      </div>
      <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        Page {pageIdx + 1} · {fields.length} field
        {fields.length === 1 ? '' : 's'}
      </figcaption>
    </figure>
  )
}

// Editable HTML input positioned over a rendered field.
// Same coordinate math as the existing FieldOverlay in OperationPanel.jsx.
function FieldInput({ field, value, busy, onChange }) {
  const style = {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  }

  if (field.type === 'text') {
    return (
      <input
        type="text"
        value={value ?? ''}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        title={field.name}
        className="absolute border border-orange-500/70 bg-yellow-50/80 px-1 text-slate-900 outline-none focus:bg-yellow-100"
        style={{ ...style, fontSize: 'clamp(9px, 1.2vw, 14px)' }}
      />
    )
  }
  if (field.type === 'checkbox') {
    return (
      <label
        className="absolute flex items-center justify-center border border-orange-500/70 bg-yellow-50/80"
        style={style}
        title={field.name}
      >
        <input
          type="checkbox"
          checked={!!value}
          disabled={busy}
          onChange={(e) => onChange(e.target.checked)}
          className="m-0"
        />
      </label>
    )
  }
  if (field.type === 'radio' || field.type === 'dropdown') {
    return (
      <select
        value={value ?? ''}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        title={field.name}
        className="absolute border border-orange-500/70 bg-yellow-50/80 px-1 text-slate-900"
        style={{ ...style, fontSize: 'clamp(9px, 1.2vw, 14px)' }}
      >
        <option value="">—</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  // signature, button, listbox — passive visual marker.
  return (
    <div
      title={`${field.name} (${field.type})`}
      className="absolute flex items-center justify-center border border-slate-400 bg-slate-200/80 text-[10px] text-slate-700"
      style={style}
    >
      {field.type}
    </div>
  )
}

function FieldListItem({ field, value }) {
  const empty =
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (field.type === 'checkbox' && value === false)
  return (
    <li
      className={`flex items-center justify-between rounded px-2 py-1 ${
        empty
          ? 'text-slate-400 dark:text-slate-500'
          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      }`}
      title={`${field.name} (${field.type}, page ${field.page + 1})`}
    >
      <span className="truncate">{field.name || `(unnamed ${field.type})`}</span>
      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide">
        {empty ? 'empty' : 'filled'}
      </span>
    </li>
  )
}
