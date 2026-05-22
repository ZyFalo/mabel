import { Fragment, ReactNode, useMemo, useState } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  sortable?: boolean
  accessor: (row: T) => ReactNode
  className?: string
  /** Optional value extractor used for sorting; defaults to accessor result */
  sortValue?: (row: T) => string | number | null | undefined
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey?: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  renderExpanded?: (row: T) => ReactNode
  loading?: boolean
  emptyMessage?: string
  /** Optional toolbar rendered above the table inside the same wrapper. */
  toolbar?: ReactNode
}

type SortDir = 'asc' | 'desc'

interface SortState {
  key: string
  dir: SortDir
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  renderExpanded,
  loading,
  emptyMessage = 'Sin resultados',
  toolbar,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  function getKey(row: T, index: number): string {
    return rowKey ? rowKey(row, index) : String(index)
  }

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' }
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' }
      return null
    })
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const extractor =
      col.sortValue ??
      ((row: T) => {
        const v = col.accessor(row)
        if (typeof v === 'string' || typeof v === 'number') return v
        return null
      })
    const copy = [...rows]
    copy.sort((a, b) => {
      const va = extractor(a)
      const vb = extractor(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (va < vb) return sort.dir === 'asc' ? -1 : 1
      if (va > vb) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, sort, columns])

  const colCount = columns.length + (renderExpanded ? 1 : 0)

  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--ink-200)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {toolbar && (
        <div
          style={{
            background: 'var(--ink-50)',
            borderBottom: '1px solid var(--ink-100)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--ink-50)' }}>
            <tr>
              {renderExpanded && <th style={{ width: 36 }} aria-label="Expandir" />}
              {columns.map((col) => {
                const isSorted = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col)}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={col.className ?? ''}
                    style={{
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--ink-500)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      padding: '10px 16px',
                      cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      borderBottom: '1px solid var(--ink-200)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="inline-flex items-center" style={{ gap: 4 }}>
                      {col.header}
                      {col.sortable && (
                        <span style={{ color: 'var(--ink-400)', fontSize: 9, lineHeight: 1 }}>
                          {isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '40px 16px',
                    textAlign: 'center',
                    color: 'var(--ink-400)',
                    fontSize: 13,
                  }}
                >
                  Cargando…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '40px 16px',
                    textAlign: 'center',
                    color: 'var(--ink-400)',
                    fontSize: 13,
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => {
                const key = getKey(row, idx)
                const isExpanded = expandedKeys.has(key)
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => onRowClick?.(row)}
                      style={{
                        cursor: onRowClick ? 'pointer' : 'default',
                        transition: 'background var(--dur-fast) var(--ease-out)',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background = 'rgba(244, 237, 236, 0.55)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      {renderExpanded && (
                        <td
                          style={{
                            padding: '10px 8px',
                            verticalAlign: 'middle',
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded(key)
                            }}
                            aria-label={isExpanded ? 'Colapsar fila' : 'Expandir fila'}
                            aria-expanded={isExpanded}
                            style={{
                              width: 24,
                              height: 24,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 6,
                              color: 'var(--ink-500)',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 11,
                              transition: 'background var(--dur-fast) var(--ease-out)',
                            }}
                            onMouseEnter={(e) => {
                              ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-100)'
                            }}
                            onMouseLeave={(e) => {
                              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                            }}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={col.className ?? ''}
                          style={{
                            padding: '10px 16px',
                            verticalAlign: 'middle',
                            color: 'var(--ink-900)',
                            borderBottom: '1px solid var(--ink-100)',
                            fontSize: 13,
                          }}
                        >
                          {col.accessor(row)}
                        </td>
                      ))}
                    </tr>
                    {renderExpanded && isExpanded && (
                      <tr
                        style={{
                          background: 'var(--ink-50)',
                        }}
                      >
                        <td
                          colSpan={colCount}
                          style={{
                            padding: '16px 24px',
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          {renderExpanded(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
