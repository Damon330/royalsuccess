interface PaginationProps {
  page:         number
  totalPages:   number
  totalCount:   number
  pageSize:     number
  onPageChange: (page: number) => void
  className?:   string
}

export default function Pagination({
  page, totalPages, totalCount, pageSize, onPageChange, className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, totalCount)

  function getPages(): (number | '...')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | '...')[] = [1]
    if (page > 3)              pages.push('...')
    const start = Math.max(2, page - 1)
    const end   = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
    return pages
  }

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-brand-border ${className}`}>
      <p className="text-xs text-brand-muted">
        Showing <span className="font-medium text-brand-text">{from}–{to}</span> of{' '}
        <span className="font-medium text-brand-text">{totalCount.toLocaleString()}</span> records
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm font-medium text-brand-muted border border-brand-border rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
        >
          ← Prev
        </button>

        {getPages().map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="w-9 text-center text-brand-muted text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`min-w-[36px] h-9 text-sm font-medium rounded-lg border transition-colors ${
                p === page
                  ? 'bg-primary text-white border-primary'
                  : 'text-brand-text border-brand-border hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm font-medium text-brand-muted border border-brand-border rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
