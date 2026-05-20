// Single source of truth for the operation catalog. The Sidebar renders
// these as grouped tools; OperationPanel switches on the active op's id
// to render its matching panel. Add a new operation by appending here
// (and wiring its panel in OperationPanel.jsx).

export const OPERATION_GROUPS = [
  {
    id: 'pages',
    label: 'Pages',
    operations: [
      { id: 'merge', label: 'Merge', icon: '🔗' },
      { id: 'split', label: 'Split', icon: '✂️' },
      { id: 'rotate', label: 'Rotate', icon: '↻' },
      { id: 'reorder', label: 'Reorder', icon: '⇆' },
      { id: 'delete', label: 'Delete', icon: '🗑' },
    ],
  },
  {
    id: 'annotate',
    label: 'Sign & Annotate',
    operations: [
      { id: 'sign', label: 'Sign & Fill', icon: '✍️' },
      { id: 'fill-form', label: 'Fill Form', icon: '📋' },
      { id: 'redact', label: 'Redact', icon: '⬛' },
    ],
  },
  {
    id: 'convert',
    label: 'Convert',
    operations: [
      { id: 'jpg-to-pdf', label: 'Images → PDF', icon: '🖼' },
      { id: 'pdf-to-jpg', label: 'PDF → JPG', icon: '📤' },
    ],
  },
]

export const ALL_OPERATIONS = OPERATION_GROUPS.flatMap((g) => g.operations)

export function findOperation(id) {
  return ALL_OPERATIONS.find((op) => op.id === id) || null
}
