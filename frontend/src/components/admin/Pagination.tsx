interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: PaginationProps) {
  const safeTotal = Math.max(0, total)
  const totalPages = safeTotal === 0 ? 1 : Math.ceil(safeTotal / pageSize)
  const currentPage = Math.min(Math.max(1, page), totalPages)

  const start = safeTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, safeTotal)

  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm">
      <div className="flex items-center gap-3 text-text-primary/70">
        <span>
          Mostrando <span className="font-medium text-text-primary">{start}</span>
          {' '}-{' '}
          <span className="font-medium text-text-primary">{end}</span>
          {' '}de <span className="font-medium text-text-primary">{safeTotal}</span>
        </span>

        <span className="hidden sm:inline text-gray-300">|</span>

        <label className="hidden sm:flex items-center gap-2">
          <span>Filas por pagina</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(currentPage - 1)}
          disabled={!canPrev}
          className="px-3 py-1.5 border border-gray-300 rounded text-text-primary hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Anterior
        </button>

        <span className="px-3 text-text-primary/70">
          Pagina <span className="font-medium text-text-primary">{currentPage}</span> de{' '}
          <span className="font-medium text-text-primary">{totalPages}</span>
        </span>

        <button
          type="button"
          onClick={() => canNext && onPageChange(currentPage + 1)}
          disabled={!canNext}
          className="px-3 py-1.5 border border-gray-300 rounded text-text-primary hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
