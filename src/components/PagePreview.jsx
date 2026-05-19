/**
 * Shows the rendered thumbnail(s) for each loaded file. Rendering is done
 * by the parent (App) via pdfRenderService and passed in as data URLs so
 * this component stays presentational.
 *
 * Architecture: each file entry carries `thumbnails` (array) and
 * `pageCount`, so moving from "first page" to full per-page previews is
 * just a matter of asking the render service for more pages.
 */
export default function PagePreview({ files }) {
  if (files.length === 0) return null

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Preview</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {files.map((f) => (
          <figure
            key={f.id}
            className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded bg-slate-50">
              {f.status === 'rendering' && (
                <span className="text-xs text-slate-400">Rendering…</span>
              )}
              {f.status === 'error' && (
                <span className="px-2 text-center text-xs text-red-500">
                  Could not render preview
                </span>
              )}
              {f.status === 'ready' && f.thumbnails?.[0] && (
                <img
                  src={f.thumbnails[0]}
                  alt={`First page of ${f.file.name}`}
                  className="max-h-40 w-auto object-contain shadow-sm"
                />
              )}
            </div>
            <figcaption className="mt-2 w-full truncate text-center text-xs text-slate-500">
              {f.file.name}
              {typeof f.pageCount === 'number' && (
                <span className="text-slate-400">
                  {' '}
                  · {f.pageCount} page{f.pageCount === 1 ? '' : 's'}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
