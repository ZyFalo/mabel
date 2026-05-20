import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import { useToastStore } from '../../stores/toastStore'

// ============================================================================
// Types
// ============================================================================

type AuditAction =
  | 'login'
  | 'view_user'
  | 'disable_user'
  | 'change_config'
  | 'review_report'
  | 'review_safety_event'
  | 'export_data'

type ActionFilter = 'todos' | AuditAction

interface AuditLogItem {
  id: string
  admin_id: string | null
  admin_email_masked: string | null
  action: AuditAction | string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown> | null
  ip: string | null
  created_at: string
}

interface AuditLogsResponse {
  items: AuditLogItem[]
  total: number
  page: number
  page_size: number
}

interface FiltersState {
  admin: string
  action: ActionFilter
  from: string
  to: string
}

const DEFAULT_FILTERS: FiltersState = {
  admin: '',
  action: 'todos',
  from: '',
  to: '',
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Inicio de sesion',
  view_user: 'Ver usuario',
  disable_user: 'Deshabilitar usuario',
  change_config: 'Cambio de config',
  review_report: 'Revisar reporte',
  review_safety_event: 'Revisar evento SOS',
  export_data: 'Exportar datos',
}

const ACTION_CHIP_CLASSES: Record<string, string> = {
  login: 'bg-gray-100 text-text-primary/70 border-gray-300',
  view_user: 'bg-accent/10 text-accent border-accent/30',
  disable_user: 'bg-danger/10 text-danger border-danger/30',
  change_config: 'bg-warning/10 text-warning border-warning/30',
  review_report: 'bg-primary/10 text-primary border-primary/30',
  review_safety_event: 'bg-danger/10 text-danger border-danger/30',
  export_data: 'bg-success/10 text-success border-success/30',
}

// ============================================================================
// Helpers
// ============================================================================

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}

function truncateDetails(row: AuditLogItem): string {
  const parts: string[] = []
  if (row.target_type) {
    const tid = row.target_id ? `:${row.target_id.slice(0, 8)}` : ''
    parts.push(`${row.target_type}${tid}`)
  }
  if (row.details && typeof row.details === 'object') {
    const keys = Object.keys(row.details)
    if (keys.length > 0) {
      const first = keys[0]
      const value = row.details[first]
      const valStr =
        typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : Array.isArray(value)
              ? `[${value.length}]`
              : typeof value === 'object' && value !== null
                ? '{...}'
                : ''
      parts.push(`${first}=${valStr}`)
      if (keys.length > 1) parts.push(`+${keys.length - 1}`)
    }
  }
  const out = parts.join(' · ')
  if (out.length > 80) return out.slice(0, 77) + '...'
  return out || '—'
}

function ActionChip({ action }: { action: string }) {
  const label = ACTION_LABELS[action] ?? action
  const cls =
    ACTION_CHIP_CLASSES[action] ?? 'bg-gray-100 text-text-primary/70 border-gray-300'
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border tracking-wide',
        cls,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

function ExpandedDetail({ row }: { row: AuditLogItem }) {
  const fullJson = useMemo(() => {
    const payload = {
      id: row.id,
      action: row.action,
      admin_id: row.admin_id,
      admin_email_masked: row.admin_email_masked,
      target_type: row.target_type,
      target_id: row.target_id,
      ip: row.ip,
      created_at: row.created_at,
      details: row.details ?? null,
    }
    try {
      return JSON.stringify(payload, null, 2)
    } catch {
      return '{}'
    }
  }, [row])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Log ID
          </p>
          <p className="font-mono text-text-primary/80">{row.id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Admin
          </p>
          <p className="font-mono text-text-primary/80">
            {row.admin_email_masked ?? row.admin_id?.slice(0, 8) ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Target
          </p>
          <p className="font-mono text-text-primary/80">
            {row.target_type
              ? `${row.target_type}${row.target_id ? `:${row.target_id.slice(0, 8)}` : ''}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            IP
          </p>
          <p className="font-mono text-text-primary/80">{row.ip ?? '—'}</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          Detalle completo (JSON)
        </p>
        <pre className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[11.5px] font-mono leading-relaxed text-text-primary/80 overflow-x-auto whitespace-pre">
          {fullJson}
        </pre>
      </div>

      <p className="text-[11px] text-text-primary/40 italic border-t border-gray-200 pt-2">
        Los registros de auditoria son append-only. No es posible editar ni eliminar entradas.
      </p>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function AuditLogs() {
  const addToast = useToastStore((s) => s.addToast)

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [data, setData] = useState<AuditLogsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const buildParams = useCallback(
    (extra?: Record<string, string | number>) => {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
        ...(extra ?? {}),
      }
      if (filters.admin.trim()) params.admin_id = filters.admin.trim()
      if (filters.action !== 'todos') params.action = filters.action
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      return params
    },
    [filters, page, pageSize],
  )

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiClient.get<AuditLogsResponse>('/admin/logs', {
        params: buildParams(),
      })
      setData(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el registro de auditoria.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  function updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const columns: DataTableColumn<AuditLogItem>[] = useMemo(
    () => [
      {
        key: 'created_at',
        header: 'Fecha / hora',
        sortable: true,
        sortValue: (row) => row.created_at,
        accessor: (row) => (
          <span className="text-sm text-text-primary/80 tabular-nums">
            {formatDateTime(row.created_at)}
          </span>
        ),
        className: 'w-[180px]',
      },
      {
        key: 'admin',
        header: 'Admin',
        accessor: (row) => (
          <span className="font-mono text-[12px] text-text-primary/80 tracking-tight">
            {row.admin_email_masked ?? row.admin_id?.slice(0, 8) ?? '—'}
          </span>
        ),
        className: 'w-[200px]',
      },
      {
        key: 'action',
        header: 'Accion',
        sortable: true,
        sortValue: (row) => row.action,
        accessor: (row) => <ActionChip action={row.action} />,
        className: 'w-[170px]',
      },
      {
        key: 'detail',
        header: 'Detalle',
        accessor: (row) => (
          <span className="text-[12px] text-text-primary/70 font-mono">
            {truncateDetails(row)}
          </span>
        ),
      },
      {
        key: 'ip',
        header: 'IP',
        accessor: (row) => (
          <span className="font-mono text-[11px] text-text-primary/60">{row.ip ?? '—'}</span>
        ),
        className: 'w-[130px]',
      },
    ],
    [],
  )

  const activeFilterCount =
    (filters.admin.trim() ? 1 : 0) +
    (filters.action !== 'todos' ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)

  const exportParams = useMemo<Record<string, string | number | undefined>>(() => {
    const p: Record<string, string | number | undefined> = {}
    if (filters.admin.trim()) p.admin_id = filters.admin.trim()
    if (filters.action !== 'todos') p.action = filters.action
    if (filters.from) p.from = filters.from
    if (filters.to) p.to = filters.to
    return p
  }, [filters])

  const total = data?.total ?? 0

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Auditoria
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">
            Registro de auditoria
          </h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Bitacora inmutable de acciones administrativas. Append-only por diseno.
          </p>
        </div>
        <ExportCsvButton
          url="/admin/logs/export.csv"
          params={exportParams}
          filename={`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`}
          onError={(msg) => addToast({ type: 'error', message: msg })}
        />
      </header>

      {/* Filters */}
      <FilterBar
        title={
          activeFilterCount > 0
            ? `Filtros (${activeFilterCount} ${activeFilterCount === 1 ? 'activo' : 'activos'})`
            : 'Filtros'
        }
        onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
      >
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label
            htmlFor="filter-admin"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Admin (email o ID)
          </label>
          <input
            id="filter-admin"
            type="text"
            value={filters.admin}
            onChange={(e) => updateFilter('admin', e.target.value)}
            placeholder="admin@umb o uuid"
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label
            htmlFor="filter-action"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Accion
          </label>
          <select
            id="filter-action"
            value={filters.action}
            onChange={(e) => updateFilter('action', e.target.value as ActionFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todas</option>
            <option value="login">Inicio de sesion</option>
            <option value="view_user">Ver usuario</option>
            <option value="disable_user">Deshabilitar usuario</option>
            <option value="change_config">Cambio de config</option>
            <option value="review_report">Revisar reporte</option>
            <option value="review_safety_event">Revisar evento SOS</option>
            <option value="export_data">Exportar datos</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label
            htmlFor="filter-from"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Desde
          </label>
          <input
            id="filter-from"
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter('from', e.target.value)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label
            htmlFor="filter-to"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Hasta
          </label>
          <input
            id="filter-to"
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter('to', e.target.value)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </FilterBar>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-4 border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchLogs}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable<AuditLogItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        rowKey={(row) => row.id}
        renderExpanded={(row) => <ExpandedDetail row={row} />}
        emptyMessage={
          activeFilterCount > 0
            ? 'No se encontraron registros con los filtros aplicados.'
            : 'No hay registros de auditoria todavia.'
        }
      />

      {/* Pagination */}
      <Pagination
        page={data?.page ?? page}
        pageSize={data?.page_size ?? pageSize}
        total={total}
        onPageChange={(p) => setPage(p)}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />
    </div>
  )
}
