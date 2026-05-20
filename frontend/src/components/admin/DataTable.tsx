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
    const extractor = col.sortValue ?? ((row: T) => {
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
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {renderExpanded && <th className="w-10" aria-label="Expandir" />}
              {columns.map((col) => {
                const isSorted = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    className={[
                      'text-left text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-3',
                      col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : '',
                      col.className ?? '',
                    ].join(' ')}
                    onClick={() => toggleSort(col)}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="text-text-primary/40 text-[10px] leading-none">
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
                <td colSpan={colCount} className="px-4 py-10 text-center text-text-primary/50">
                  Cargando...
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-text-primary/50">
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
                      className={[
                        'border-b border-gray-100 last:border-b-0',
                        onRowClick ? 'cursor-pointer hover:bg-gray-50' : 'hover:bg-gray-50/60',
                      ].join(' ')}
                      onClick={() => onRowClick?.(row)}
                    >
                      {renderExpanded && (
                        <td className="px-2 py-3 align-middle">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpanded(key)
                            }}
                            className="w-6 h-6 inline-flex items-center justify-center rounded text-text-primary/60 hover:bg-gray-100 hover:text-text-primary text-xs"
                            aria-label={isExpanded ? 'Colapsar fila' : 'Expandir fila'}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={['px-4 py-3 align-middle text-text-primary', col.className ?? ''].join(' ')}
                        >
                          {col.accessor(row)}
                        </td>
                      ))}
                    </tr>
                    {renderExpanded && isExpanded && (
                      <tr className="bg-gray-50/70 border-b border-gray-100">
                        <td colSpan={colCount} className="px-6 py-4">
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
