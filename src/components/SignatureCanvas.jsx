import { useRef, useState } from 'react'

/**
 * Tiny drawing canvas for capturing a handwritten signature. Calls
 * onSave with { bytes: Uint8Array, dataUrl: string } once the user
 * commits ("Use this signature").
 */
export default function SignatureCanvas({ disabled, onSave }) {
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
