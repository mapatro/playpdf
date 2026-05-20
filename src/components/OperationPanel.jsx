import { useCallback, useEffect, useRef, useState } from 'react'
import { renderThumbnails } from '../services/pdfRenderService.js'
import { ActiveOpHeading } from './Sidebar.jsx'

/**
 * Workspace panel for the currently active operation. The tool selector
 * itself lives in the sidebar; here we just render the matching panel
 * for activeOp, along with the message/error from the last run.
 */
export default function OperationPanel({
  files,
  busy,
  activeOp,
  onMerge,
  onSplitRange,
  onSplitAll,
  onRotate,
  onReorder,
  onDelete,
  onImagesToPdf,
  onPdfToJpg,
  onRedact,
  onSignAndFill,
  onInspectForm,
  onFillForm,
  message,
  error,
  lastResult,
  onUseResultAsInput,
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
    <section className="mt-2">
      <div className="mb-4">
        <ActiveOpHeading activeOp={activeOp} />
      </div>

      {activeOp === 'merge' && (
        <div className="mt-2">
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
        activeOp === 'delete' ||
        activeOp === 'redact' ||
        activeOp === 'sign' ||
        activeOp === 'fill-form' ||
        activeOp === 'pdf-to-jpg') && (
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
          onRedact={onRedact}
          onSignAndFill={onSignAndFill}
          onInspectForm={onInspectForm}
          onFillForm={onFillForm}
          onPdfToJpg={onPdfToJpg}
        />
      )}

      {activeOp === 'jpg-to-pdf' && (
        <ImagesToPdfPanel busy={busy} onImagesToPdf={onImagesToPdf} />
      )}

      {message && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            {message}
          </p>
          {lastResult && onUseResultAsInput && (
            <button
              type="button"
              onClick={onUseResultAsInput}
              className="rounded-md border border-orange-300 bg-white px-3 py-1 text-xs font-medium text-orange-700 transition-colors hover:border-orange-500 hover:bg-orange-50 dark:border-orange-700 dark:bg-slate-900 dark:text-orange-300 dark:hover:bg-slate-800"
            >
              ↻ Use result as next input
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="mt-4 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
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
  onRedact,
  onSignAndFill,
  onInspectForm,
  onFillForm,
  onPdfToJpg,
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
      {selectedFile && op === 'pdf-to-jpg' && (
        <PdfToJpgPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onPdfToJpg={onPdfToJpg}
        />
      )}
      {selectedFile && op === 'redact' && (
        <RedactPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onRedact={onRedact}
        />
      )}
      {selectedFile && op === 'sign' && (
        <SignAndFillPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onSignAndFill={onSignAndFill}
        />
      )}
      {selectedFile && op === 'fill-form' && (
        <FillFormPanel
          key={selectedFile.id}
          file={selectedFile}
          busy={busy}
          onInspectForm={onInspectForm}
          onFillForm={onFillForm}
        />
      )}
    </div>
  )
}

/**
 * Fill Form panel: detects AcroForm fields on the selected PDF and
 * renders matching HTML inputs positioned over each page thumbnail.
 * Falls back to a helpful message when the PDF has no real form fields
 * and points the user at Sign & Fill instead.
 */
function FillFormPanel({ file, busy, onInspectForm, onFillForm }) {
  const { thumbs, loading: thumbsLoading, err: thumbsErr } =
    useAllThumbnails(file)
  const [fields, setFields] = useState(null) // null = not loaded; [] = no fields
  const [inspectErr, setInspectErr] = useState('')
  const [values, setValues] = useState({}) // {fieldName: value}
  const [flatten, setFlatten] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFields(null)
    setInspectErr('')
    setValues({})
    onInspectForm(file)
      .then((res) => {
        if (cancelled) return
        if (!res) {
          setFields([])
          return
        }
        setFields(res)
        // Seed values with the fields' existing values so we don't blow
        // away pre-filled defaults.
        const seed = {}
        for (const f of res) {
          if (seed[f.name] !== undefined) continue
          if (f.type === 'text' && typeof f.value === 'string')
            seed[f.name] = f.value
          else if (f.type === 'checkbox') seed[f.name] = !!f.value
          else if (f.type === 'radio' || f.type === 'dropdown')
            seed[f.name] = f.value ?? ''
          else if (f.type === 'listbox')
            seed[f.name] = Array.isArray(f.value) ? f.value : []
        }
        setValues(seed)
      })
      .catch((err) => {
        if (cancelled) return
        setInspectErr(
          err?.message || 'Failed to inspect the PDF for form fields.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [file, onInspectForm])

  const setOne = (name, v) =>
    setValues((prev) => ({ ...prev, [name]: v }))

  const totalFields = fields?.length || 0
  const apply = () => onFillForm(file, values, { flatten })

  // Group fields by page so we can overlay per-thumbnail.
  const fieldsByPage = (fields || []).reduce((acc, f) => {
    ;(acc[f.page] ||= []).push(f)
    return acc
  }, {})

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Detects AcroForm fields baked into the PDF (tax forms, applications,
        any PDF made in Acrobat / LibreOffice) and lets you fill them
        in-place. Recipients opening the file see proper field values, not
        text stamped on top.
      </p>

      {fields === null && !inspectErr && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Inspecting form fields…
        </p>
      )}
      {inspectErr && (
        <p className="text-xs text-red-500 dark:text-red-400">{inspectErr}</p>
      )}

      {fields !== null && fields.length === 0 && (
        <div className="rounded border border-orange-200 dark:border-slate-700 bg-orange-50 dark:bg-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300">
          This PDF has no AcroForm fields — it's a flattened or
          scan-style PDF. Use the <strong>Sign &amp; Fill</strong> tab
          instead to stamp text or signatures anywhere on the page.
        </div>
      )}

      {fields !== null && fields.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={apply}
              className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
            >
              {busy
                ? 'Working…'
                : `Fill ${totalFields} field${totalFields === 1 ? '' : 's'} & Download`}
            </button>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={flatten}
                disabled={busy}
                onChange={(e) => setFlatten(e.target.checked)}
              />
              Flatten (lock values; can't be edited later)
            </label>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Found {totalFields} field{totalFields === 1 ? '' : 's'} across{' '}
              {Object.keys(fieldsByPage).length} page
              {Object.keys(fieldsByPage).length === 1 ? '' : 's'}.
            </span>
          </div>

          {thumbsLoading && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Rendering all pages…
            </p>
          )}
          {thumbsErr && (
            <p className="text-xs text-red-500 dark:text-red-400">{thumbsErr}</p>
          )}

          {thumbs && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {thumbs.map((src, i) => (
                <FormPageThumb
                  key={i}
                  src={src}
                  pageIdx={i}
                  fields={fieldsByPage[i] || []}
                  values={values}
                  busy={busy}
                  onChange={setOne}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FormPageThumb({ src, pageIdx, fields, values, busy, onChange }) {
  return (
    <figure className="flex flex-col items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2">
      <div className="relative w-full overflow-hidden">
        <img
          src={src}
          alt={`Page ${pageIdx + 1}`}
          draggable={false}
          className="block w-full object-contain shadow-sm"
        />
        {fields.map((f, i) => (
          <FieldOverlay
            key={`${f.name}-${i}`}
            field={f}
            value={values[f.name]}
            busy={busy}
            onChange={(v) => onChange(f.name, v)}
          />
        ))}
      </div>
      <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        p{pageIdx + 1} · {fields.length} field{fields.length === 1 ? '' : 's'}
      </figcaption>
    </figure>
  )
}

function FieldOverlay({ field, value, busy, onChange }) {
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
        className="absolute border border-orange-500/70 bg-yellow-50/80 px-1 text-[10px] text-slate-900 outline-none focus:bg-yellow-100"
        style={style}
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
          className="m-0 h-3 w-3"
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
        className="absolute border border-orange-500/70 bg-yellow-50/80 px-1 text-[10px] text-slate-900"
        style={style}
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
  // signature, button, listbox — show a passive label.
  return (
    <div
      title={`${field.name} (${field.type})`}
      className="absolute flex items-center justify-center border border-slate-400 bg-slate-200/80 text-[9px] text-slate-700"
      style={style}
    >
      {field.type}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sign & Fill panel: draw or type a signature, type free text, click on
// any page thumbnail to place the current tool. Everything lives in
// normalized [0,1] page coords (top-left origin) so the PDF service can
// stay UI-agnostic.

function SignatureCanvas({ disabled, onSave }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [hasInk, setHasInk] = useState(false)

  const getCtx = () => canvasRef.current?.getContext('2d')

  const pointAt = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    // Canvas is 400x150 internally; CSS may scale it. Map screen→canvas.
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    }
  }

  const onPointerDown = (e) => {
    if (disabled) return
    e.preventDefault()
    canvasRef.current?.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = pointAt(e)
    setHasInk(true)
  }
  const onPointerMove = (e) => {
    if (!drawing.current) return
    const ctx = getCtx()
    if (!ctx) return
    const p = pointAt(e)
    if (!p || !last.current) return
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const onPointerUp = () => {
    drawing.current = false
    last.current = null
  }

  const clear = () => {
    const ctx = getCtx()
    if (!ctx || !canvasRef.current) return
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasInk(false)
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))),
        'image/png',
      ),
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const dataUrl = URL.createObjectURL(blob)
    onSave({ bytes, dataUrl })
  }

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Draw your signature below (touch, stylus, or mouse).
      </p>
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="block w-full max-w-md rounded border border-slate-300 dark:border-slate-600 bg-white touch-none"
        style={{ touchAction: 'none' }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || !hasInk}
          onClick={save}
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          Use this signature
        </button>
        <button
          type="button"
          disabled={disabled || !hasInk}
          onClick={clear}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

function SignAndFillPanel({ file, busy, onSignAndFill }) {
  const { thumbs, loading, err } = useAllThumbnails(file)
  const [tool, setTool] = useState('sig') // 'sig' | 'text'
  const [signature, setSignature] = useState(null) // { bytes, dataUrl }
  const [sigWidthPct, setSigWidthPct] = useState(25) // % of page width
  const [text, setText] = useState('')
  const [fontSize, setFontSize] = useState(12)
  const [placements, setPlacements] = useState({}) // {pageIdx: [{kind, x, y, ...}]}

  const totalPlacements = Object.values(placements).reduce(
    (s, p) => s + p.length,
    0,
  )

  const placeOnPage = (idx, x, y) => {
    if (tool === 'sig') {
      if (!signature) return
      setPlacements((prev) => ({
        ...prev,
        [idx]: [
          ...(prev[idx] || []),
          {
            kind: 'sig',
            x,
            y,
            width: sigWidthPct / 100,
            png: signature.bytes,
            dataUrl: signature.dataUrl,
          },
        ],
      }))
    } else if (tool === 'text') {
      if (!text) return
      setPlacements((prev) => ({
        ...prev,
        [idx]: [
          ...(prev[idx] || []),
          { kind: 'text', x, y, text, fontSize },
        ],
      }))
    }
  }

  const removePlacement = (idx, pi) =>
    setPlacements((prev) => {
      const next = { ...prev }
      const arr = (next[idx] || []).slice()
      arr.splice(pi, 1)
      if (arr.length === 0) delete next[idx]
      else next[idx] = arr
      return next
    })

  const apply = () => {
    // Strip dataUrl before sending to the service.
    const out = {}
    for (const [k, items] of Object.entries(placements)) {
      out[k] = items.map(({ dataUrl, ...rest }) => rest)
    }
    onSignAndFill(file, out)
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Sign and fill PDFs without uploading them. Draw a signature or
        type free text, then click a page thumbnail to drop it where you
        want it. Click any placed item to remove.
      </p>

      {/* Tool toggle */}
      <div
        role="radiogroup"
        aria-label="Tool"
        className="mb-4 inline-flex rounded-lg border border-orange-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={tool === 'sig'}
          disabled={busy}
          onClick={() => setTool('sig')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tool === 'sig'
              ? 'bg-orange-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-orange-600'
          }`}
        >
          Signature
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={tool === 'text'}
          disabled={busy}
          onClick={() => setTool('text')}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tool === 'text'
              ? 'bg-orange-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:text-orange-600'
          }`}
        >
          Text
        </button>
      </div>

      {/* Tool-specific controls */}
      {tool === 'sig' && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          {!signature && (
            <SignatureCanvas
              disabled={busy}
              onSave={setSignature}
            />
          )}
          {signature && (
            <div>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Your signature is ready — click any page below to place it.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1">
                  <img
                    src={signature.dataUrl}
                    alt="Your signature"
                    className="max-h-12"
                  />
                </div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Width
                  <span className="ml-1 text-slate-400 dark:text-slate-500">
                    ({sigWidthPct}% of page)
                  </span>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={sigWidthPct}
                    disabled={busy}
                    onChange={(e) => setSigWidthPct(Number(e.target.value))}
                    className="mt-1 block w-40"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSignature(null)}
                  className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
                >
                  Draw again
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tool === 'text' && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Type what you want to drop on the page, then click a thumbnail.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Text
              <input
                type="text"
                value={text}
                disabled={busy}
                placeholder="e.g. John Smith"
                onChange={(e) => setText(e.target.value)}
                className="mt-1 block w-64 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Font size
              <input
                type="number"
                min={6}
                max={72}
                value={fontSize}
                disabled={busy}
                onChange={(e) =>
                  setFontSize(
                    Math.max(6, Math.min(72, Number(e.target.value) || 12)),
                  )
                }
                className="mt-1 block w-20 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 px-2 py-1 text-sm"
              />
            </label>
          </div>
        </div>
      )}

      {/* Apply / clear */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || totalPlacements === 0}
          onClick={apply}
          className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          {busy
            ? 'Working…'
            : totalPlacements === 0
              ? 'Click a page to place'
              : `Apply ${totalPlacements} item${totalPlacements === 1 ? '' : 's'} & Download`}
        </button>
        <button
          type="button"
          disabled={busy || totalPlacements === 0}
          onClick={() => setPlacements({})}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Clear all
        </button>
        <span className="self-center text-[11px] text-slate-400 dark:text-slate-500">
          {tool === 'sig'
            ? signature
              ? 'Tap a page to place your signature.'
              : 'Draw a signature first.'
            : text
              ? 'Tap a page to place your text.'
              : 'Type some text first.'}
        </span>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Rendering all pages…
        </p>
      )}
      {err && <p className="text-xs text-red-500 dark:text-red-400">{err}</p>}

      {thumbs && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {thumbs.map((src, i) => (
            <SignThumb
              key={i}
              src={src}
              pageIdx={i}
              busy={busy}
              items={placements[i] || []}
              tool={tool}
              canPlace={tool === 'sig' ? !!signature : !!text}
              onPlace={(x, y) => placeOnPage(i, x, y)}
              onRemove={(pi) => removePlacement(i, pi)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SignThumb({
  src,
  pageIdx,
  busy,
  items,
  tool,
  canPlace,
  onPlace,
  onRemove,
}) {
  const boxRef = useRef(null)

  const onClick = (e) => {
    if (busy || !canPlace) return
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    onPlace(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)))
  }

  const cursor = busy
    ? 'not-allowed'
    : canPlace
      ? 'crosshair'
      : 'default'

  return (
    <figure className="flex flex-col items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2">
      <div
        ref={boxRef}
        onClick={onClick}
        className="relative w-full overflow-hidden select-none"
        style={{ cursor }}
      >
        <img
          src={src}
          alt={`Page ${pageIdx + 1}`}
          draggable={false}
          className="block w-full object-contain shadow-sm"
        />
        {items.map((item, pi) => (
          <button
            key={pi}
            type="button"
            title="Click to remove this item"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(pi)
            }}
            disabled={busy}
            className="absolute m-0 cursor-pointer border-0 bg-transparent p-0 hover:outline hover:outline-2 hover:outline-red-500"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              // Signature: width is a fraction of the page → render at that
              // fraction of the thumbnail's width. Text: shrink-wrap.
              width:
                item.kind === 'sig' ? `${item.width * 100}%` : 'auto',
            }}
          >
            {item.kind === 'sig' && item.dataUrl && (
              <img
                src={item.dataUrl}
                alt="signature"
                draggable={false}
                className="block w-full"
              />
            )}
            {item.kind === 'text' && (
              <span
                className="whitespace-pre text-slate-900"
                style={{ fontSize: `${item.fontSize * 0.4}px` }}
              >
                {item.text}
              </span>
            )}
          </button>
        ))}
      </div>
      <figcaption className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        p{pageIdx + 1} · {items.length} item{items.length === 1 ? '' : 's'}
      </figcaption>
    </figure>
  )
}

/**
 * Visual redaction panel: per-page thumbnails where the user drags
 * rectangles to black out. Rectangles are stored normalized to [0,1] in
 * the page coordinate space (top-left origin) so the PDF-side knows
 * nothing about thumbnail pixel sizes.
 */
function RedactPanel({ file, busy, onRedact }) {
  const { thumbs, loading, err } = useAllThumbnails(file)
  // rectsByPage: { [pageIdx]: [{x, y, width, height} ...] }
  const [rectsByPage, setRectsByPage] = useState({})
  const totalRects = Object.values(rectsByPage).reduce(
    (s, r) => s + r.length,
    0,
  )

  const addRect = (idx, rect) =>
    setRectsByPage((prev) => ({
      ...prev,
      [idx]: [...(prev[idx] || []), rect],
    }))

  const removeRect = (idx, ri) =>
    setRectsByPage((prev) => {
      const next = { ...prev }
      const arr = (next[idx] || []).slice()
      arr.splice(ri, 1)
      if (arr.length === 0) delete next[idx]
      else next[idx] = arr
      return next
    })

  const clearPage = (idx) =>
    setRectsByPage((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })

  const apply = () => onRedact(file, rectsByPage)

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Drag on a page to mark a redaction box. Click any box to remove it.
        This applies <strong>visual</strong> redaction (an opaque black
        rectangle is drawn over the area). For irreversible removal of the
        underlying text, follow up by exporting via <em>PDF → JPG</em> and
        re-assembling with <em>Images → PDF</em>.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || totalRects === 0}
          onClick={apply}
          className="rounded-lg bg-orange-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
        >
          {busy
            ? 'Working…'
            : totalRects === 0
              ? 'Mark areas to redact'
              : `Apply ${totalRects} redaction${totalRects === 1 ? '' : 's'} & Download`}
        </button>
        <button
          type="button"
          disabled={busy || totalRects === 0}
          onClick={() => setRectsByPage({})}
          className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
        >
          Clear all
        </button>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Rendering all pages…
        </p>
      )}
      {err && <p className="text-xs text-red-500 dark:text-red-400">{err}</p>}

      {thumbs && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {thumbs.map((src, i) => (
            <RedactThumb
              key={i}
              src={src}
              pageIdx={i}
              busy={busy}
              rects={rectsByPage[i] || []}
              onAddRect={(rect) => addRect(i, rect)}
              onRemoveRect={(ri) => removeRect(i, ri)}
              onClearPage={() => clearPage(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RedactThumb({
  src,
  pageIdx,
  busy,
  rects,
  onAddRect,
  onRemoveRect,
  onClearPage,
}) {
  const boxRef = useRef(null)
  const [dragRect, setDragRect] = useState(null) // {x,y,width,height} 0..1

  const computePoint = (e) => {
    const box = boxRef.current
    if (!box) return null
    const rect = box.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
  }

  const onMouseDown = (e) => {
    if (busy) return
    e.preventDefault()
    const p = computePoint(e)
    if (!p) return
    setDragRect({ x: p.x, y: p.y, width: 0, height: 0, startX: p.x, startY: p.y })
  }

  const onMouseMove = (e) => {
    if (!dragRect) return
    const p = computePoint(e)
    if (!p) return
    const x = Math.min(p.x, dragRect.startX)
    const y = Math.min(p.y, dragRect.startY)
    const width = Math.abs(p.x - dragRect.startX)
    const height = Math.abs(p.y - dragRect.startY)
    setDragRect({ ...dragRect, x, y, width, height })
  }

  const onMouseUp = () => {
    if (!dragRect) return
    if (dragRect.width >= 0.01 && dragRect.height >= 0.01) {
      onAddRect({
        x: dragRect.x,
        y: dragRect.y,
        width: dragRect.width,
        height: dragRect.height,
      })
    }
    setDragRect(null)
  }

  return (
    <figure className="flex flex-col items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2">
      <div
        ref={boxRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="relative w-full overflow-hidden select-none"
        style={{ cursor: busy ? 'not-allowed' : 'crosshair' }}
      >
        <img
          src={src}
          alt={`Page ${pageIdx + 1}`}
          draggable={false}
          className="block w-full object-contain shadow-sm"
        />
        {rects.map((r, ri) => (
          <button
            key={ri}
            type="button"
            title="Click to remove this redaction"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveRect(ri)
            }}
            disabled={busy}
            className="absolute bg-black/90 hover:bg-red-600/80"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          />
        ))}
        {dragRect && (
          <div
            className="absolute border border-red-500 bg-red-500/30 pointer-events-none"
            style={{
              left: `${dragRect.x * 100}%`,
              top: `${dragRect.y * 100}%`,
              width: `${dragRect.width * 100}%`,
              height: `${dragRect.height * 100}%`,
            }}
          />
        )}
      </div>
      <figcaption className="mt-1 flex w-full items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span>p{pageIdx + 1} · {rects.length} box{rects.length === 1 ? '' : 'es'}</span>
        {rects.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={onClearPage}
            className="ml-2 underline hover:text-orange-600"
          >
            clear
          </button>
        )}
      </figcaption>
    </figure>
  )
}

function PdfToJpgPanel({ file, busy, onPdfToJpg }) {
  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Renders each of the PDF's {file.pageCount} page
        {file.pageCount === 1 ? '' : 's'} as a JPG and bundles them into a
        single <code>.zip</code> for download. Higher-resolution rendering
        means slightly larger files.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => onPdfToJpg(file)}
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
      >
        {busy ? 'Working…' : `Export ${file.pageCount} page${file.pageCount === 1 ? '' : 's'} as JPG (.zip)`}
      </button>
    </div>
  )
}

function ImagesToPdfPanel({ busy, onImagesToPdf }) {
  const [images, setImages] = useState([]) // [{ id, file, url }]
  const inputRef = useRef(null)

  const isImage = (f) =>
    f.type === 'image/jpeg' ||
    f.type === 'image/png' ||
    /\.(jpe?g|png)$/i.test(f.name)

  const addFiles = (list) => {
    const incoming = Array.from(list).filter(isImage)
    if (!incoming.length) return
    setImages((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ])
  }

  const removeOne = (id) =>
    setImages((prev) => {
      const found = prev.find((x) => x.id === id)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((x) => x.id !== id)
    })

  const moveLeft = (idx) =>
    setImages((prev) => {
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })

  const moveRight = (idx) =>
    setImages((prev) => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
      return next
    })

  const clearAll = () => {
    images.forEach((x) => URL.revokeObjectURL(x.url))
    setImages([])
  }

  const buildPdf = () => onImagesToPdf(images.map((x) => x.file))

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Combine JPG and PNG images into a single PDF, one image per page.
        Use the arrows to reorder before exporting.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-8 text-center transition-colors hover:border-orange-400"
      >
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Drag &amp; drop JPG/PNG images here, or click to choose
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          JPG and PNG only · processed entirely in your browser
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {images.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {images.map((img, idx) => (
              <figure
                key={img.id}
                className="flex flex-col items-center rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-2"
              >
                <div className="flex h-28 w-full items-center justify-center overflow-hidden">
                  <img
                    src={img.url}
                    alt={img.file.name}
                    className="max-h-28 w-auto object-contain shadow-sm"
                  />
                </div>
                <figcaption className="mt-1 w-full truncate text-center text-[10px] text-slate-500 dark:text-slate-400">
                  p{idx + 1} · {img.file.name}
                </figcaption>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    disabled={busy || idx === 0}
                    onClick={() => moveLeft(idx)}
                    className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40"
                    aria-label="Move left"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    disabled={busy || idx === images.length - 1}
                    onClick={() => moveRight(idx)}
                    className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40"
                    aria-label="Move right"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeOne(img.id)}
                    className="rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-40"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              </figure>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || images.length === 0}
              onClick={buildPdf}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-200"
            >
              {busy
                ? 'Working…'
                : `Build PDF from ${images.length} image${images.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={clearAll}
              className="rounded border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 disabled:opacity-60"
            >
              Clear all
            </button>
          </div>
        </>
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
