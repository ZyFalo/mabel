import { ChevronLeft, ChevronRight } from 'lucide-react'

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

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    borderRadius: 9999,
    fontSize: 12.5,
    fontWeight: 600,
    color: enabled ? 'var(--ink-700)' : 'var(--ink-400)',
    background: 'var(--white)',
    border: `1px solid var(--ink-200)`,
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition:
      'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
  })

  return (
    <div
      className="flex flex-wrap items-center justify-between"
      style={{
        gap: 12,
        padding: '14px 4px 4px',
        fontSize: 13,
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink-600)',
      }}
    >
      <div className="flex items-center" style={{ gap: 16 }}>
        <span>
          Mostrando{' '}
          <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{start}</span>
          {' – '}
          <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{end}</span>
          {' de '}
          <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{safeTotal}</span>
        </span>

        <label className="hidden sm:flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Filas por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--ink-200)',
              background: 'var(--white)',
              color: 'var(--ink-900)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center" style={{ gap: 6 }}>
        <button
          type="button"
          onClick={() => canPrev && onPageChange(currentPage - 1)}
          disabled={!canPrev}
          style={btnStyle(canPrev)}
          onMouseEnter={(e) => {
            if (!canPrev) return
            ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-50)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--mabel-200)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--white)'
            ;(e.currentTarget as HTMLElement).style.color = canPrev ? 'var(--ink-700)' : 'var(--ink-400)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-200)'
          }}
        >
          <ChevronLeft size={13} />
          <span>Anterior</span>
        </button>

        <span style={{ padding: '0 10px', color: 'var(--ink-600)' }}>
          Página <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{currentPage}</span> de{' '}
          <span style={{ fontWeight: 600, color: 'var(--ink-900)' }}>{totalPages}</span>
        </span>

        <button
          type="button"
          onClick={() => canNext && onPageChange(currentPage + 1)}
          disabled={!canNext}
          style={btnStyle(canNext)}
          onMouseEnter={(e) => {
            if (!canNext) return
            ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-50)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--mabel-200)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--white)'
            ;(e.currentTarget as HTMLElement).style.color = canNext ? 'var(--ink-700)' : 'var(--ink-400)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-200)'
          }}
        >
          <span>Siguiente</span>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
