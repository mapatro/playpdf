import { OPERATION_GROUPS, findOperation } from '../operations.js'

/**
 * Left-sidebar tool nav. Renders grouped operations; clicking one sets
 * the active op (and closes the mobile drawer if a closer is provided).
 *
 * Props:
 *   activeOp    — id string of the currently active operation
 *   onSelectOp  — (id) => void
 *   busy        — disables tool switching while an op is running
 *   onClose     — optional callback to close the mobile drawer after a pick
 */
export default function Sidebar({ activeOp, onSelectOp, busy, onClose }) {
  const handlePick = (id) => {
    onSelectOp(id)
    onClose?.()
  }

  return (
    <nav
      aria-label="PDF tools"
      className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4"
    >
      {OPERATION_GROUPS.map((group) => (
        <section key={group.id}>
          <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {group.label}
          </h3>
          <ul className="space-y-0.5">
            {group.operations.map((op) => {
              const active = op.id === activeOp
              return (
                <li key={op.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handlePick(op.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                        : 'text-slate-600 hover:bg-orange-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">
                      {op.icon}
                    </span>
                    {op.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}

/** Render the active-op label as a breadcrumb heading. */
export function ActiveOpHeading({ activeOp }) {
  const op = findOperation(activeOp)
  if (!op) return null
  return (
    <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
      <span className="mr-2 text-xl" aria-hidden="true">
        {op.icon}
      </span>
      {op.label}
    </h2>
  )
}
