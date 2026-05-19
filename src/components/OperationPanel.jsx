/**
 * Operation buttons. Only Merge is functional in the MVP; the others are
 * scaffolded with a "Coming soon" state (pdfService already exports
 * matching stubs).
 */
const COMING_SOON = ['split', 'rotate', 'reorder']

const OPERATIONS = [
  { id: 'merge', label: 'Merge' },
  { id: 'split', label: 'Split' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'reorder', label: 'Reorder' },
]

export default function OperationPanel({
  fileCount,
  busy,
  onMerge,
  message,
  error,
}) {
  const canMerge = fileCount >= 2 && !busy

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Operations</h2>
      <div className="flex flex-wrap gap-3">
        {OPERATIONS.map((op) => {
          const soon = COMING_SOON.includes(op.id)
          if (soon) {
            return (
              <button
                key={op.id}
                type="button"
                disabled
                title="Coming soon"
                className="relative cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-400"
              >
                {op.label}
                <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Soon
                </span>
              </button>
            )
          }
          return (
            <button
              key={op.id}
              type="button"
              onClick={onMerge}
              disabled={!canMerge}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? 'Merging…' : op.label}
            </button>
          )
        })}
      </div>

      {fileCount < 2 && (
        <p className="mt-3 text-xs text-slate-400">
          Add at least 2 PDFs to enable Merge.
        </p>
      )}
      {message && (
        <p className="mt-3 text-sm font-medium text-green-600">{message}</p>
      )}
      {error && (
        <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
      )}
    </section>
  )
}
