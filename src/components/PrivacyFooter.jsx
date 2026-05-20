export default function PrivacyFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-16 border-t border-orange-100 bg-white py-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <p className="mx-auto max-w-2xl px-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        🔒 All processing happens in your browser. Your files are never
        uploaded to a server. We collect only anonymous, aggregate usage
        stats — never file names or contents.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-xs">
        <a
          href="https://patroventure.com"
          className="font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
        >
          PatroVenture
        </a>
        <a
          href="https://github.com/mapatro/playpdf"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-500 transition-colors hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400"
        >
          Source on GitHub
        </a>
      </div>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        &copy; {year} playPDF · a PatroVenture project
      </p>
    </footer>
  )
}
