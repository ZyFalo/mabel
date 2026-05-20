import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import DisableUserModal from '../../components/admin/DisableUserModal'

type StatusFilter = 'todos' | 'active' | 'disabled'
type ConsentFilter = 'todos' | 'ok' | 'no_consent' | 'revoked' | 'new_version_required'

interface UserAdminListItem {
  id: string
  email_masked: string
  display_name: string | null
  role: string
  cohort: string | null
  created_at: string
  last_session_at: string | null
  consent_status: 'ok' | 'no_consent' | 'revoked' | 'new_version_required' | string
  total_sessions: number
  disabled_at: string | null
}

interface UsersListResponse {
  items: UserAdminListItem[]
  total: number
  page: number
  page_size: number
}

interface FiltersState {
  q: string
  status: StatusFilter
  consent_status: ConsentFilter
  cohort: string
  created_from: string
  created_to: string
}

const DEFAULT_FILTERS: FiltersState = {
  q: '',
  status: 'todos',
  consent_status: 'todos',
  cohort: '',
  created_from: '',
  created_to: '',
}

const CONSENT_LABELS: Record<string, string> = {
  ok: 'Vigente',
  no_consent: 'Sin consentimiento',
  revoked: 'Revocado',
  new_version_required: 'Nueva version requerida',
}

const CONSENT_CHIP_CLASSES: Record<string, string> = {
  ok: 'bg-success/10 text-success border-success/30',
  no_consent: 'bg-gray-100 text-text-primary/60 border-gray-300',
  revoked: 'bg-danger/10 text-danger border-danger/30',
  new_version_required: 'bg-warning/10 text-warning border-warning/30',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

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
    })
  } catch {
    return '—'
  }
}

function truncateId(id: string): string {
  return id ? id.slice(0, 8) : '—'
}

function ConsentChip({ status }: { status: string }) {
  const label = CONSENT_LABELS[status] ?? status
  const cls = CONSENT_CHIP_CLASSES[status] ?? 'bg-gray-100 text-text-primary/60 border-gray-300'
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

function StatusBadge({ disabled }: { disabled: boolean }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-primary/50">
        <span className="w-1.5 h-1.5 rounded-full bg-text-primary/30" />
        Deshabilitada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      Activa
    </span>
  )
}

export default function Users() {
  const navigate = useNavigate()

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [data, setData] = useState<UsersListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [disableTarget, setDisableTarget] = useState<UserAdminListItem | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
      }
      if (filters.q.trim()) params.q = filters.q.trim()
      if (filters.status !== 'todos') params.status = filters.status
      if (filters.consent_status !== 'todos') params.consent_status = filters.consent_status
      if (filters.cohort.trim()) params.cohort = filters.cohort.trim()
      if (filters.created_from) params.created_from = filters.created_from
      if (filters.created_to) params.created_to = filters.created_to

      const res = await apiClient.get<UsersListResponse>('/admin/users', { params })
      setData(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el listado de usuarios.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  function updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const columns: DataTableColumn<UserAdminListItem>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'ID',
        sortable: true,
        sortValue: (row) => row.id,
        accessor: (row) => (
          <span className="font-mono text-[11px] text-text-primary/70 tracking-tight">
            {truncateId(row.id)}
          </span>
        ),
        className: 'w-[110px]',
      },
      {
        key: 'email',
        header: 'Email',
        sortable: true,
        sortValue: (row) => row.email_masked,
        accessor: (row) => (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm text-text-primary truncate">{row.email_masked}</span>
            {row.display_name && (
              <span className="text-[11px] text-text-primary/50 truncate">{row.display_name}</span>
            )}
          </div>
        ),
      },
      {
        key: 'cohort',
        header: 'Cohorte',
        sortable: true,
        sortValue: (row) => row.cohort ?? '',
        accessor: (row) =>
          row.cohort ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/8 text-accent border border-accent/20 text-[11px] font-medium font-mono tracking-tight">
              {row.cohort}
            </span>
          ) : (
            <span className="text-[11px] text-text-primary/30">—</span>
          ),
        className: 'w-[140px]',
      },
      {
        key: 'created_at',
        header: 'Fecha registro',
        sortable: true,
        sortValue: (row) => row.created_at,
        accessor: (row) => (
          <span className="text-sm text-text-primary/80 tabular-nums">
            {formatDate(row.created_at)}
          </span>
        ),
        className: 'w-[140px]',
      },
      {
        key: 'last_session',
        header: 'Ultimo acceso',
        sortable: true,
        sortValue: (row) => row.last_session_at ?? '',
        accessor: (row) => (
          <span className="text-sm text-text-primary/80 tabular-nums">
            {formatDateTime(row.last_session_at)}
          </span>
        ),
        className: 'w-[170px]',
      },
      {
        key: 'consent',
        header: 'Consentimiento',
        sortable: true,
        sortValue: (row) => row.consent_status,
        accessor: (row) => <ConsentChip status={row.consent_status} />,
        className: 'w-[180px]',
      },
      {
        key: 'sessions',
        header: 'Sesiones',
        sortable: true,
        sortValue: (row) => row.total_sessions,
        accessor: (row) => (
          <span className="text-sm font-medium text-text-primary tabular-nums">
            {row.total_sessions}
          </span>
        ),
        className: 'w-[90px] text-right',
      },
      {
        key: 'status',
        header: 'Estado',
        sortable: true,
        sortValue: (row) => (row.disabled_at ? 1 : 0),
        accessor: (row) => <StatusBadge disabled={!!row.disabled_at} />,
        className: 'w-[110px]',
      },
      {
        key: 'actions',
        header: 'Acciones',
        accessor: (row) => {
          const isAdmin = row.role === 'admin'
          const isDisabled = !!row.disabled_at
          if (isAdmin || isDisabled) {
            return <span className="text-[11px] text-text-primary/30">—</span>
          }
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDisableTarget(row)
              }}
              className="text-xs font-medium text-danger border border-danger/30 hover:bg-danger/5 px-2.5 py-1 rounded-md transition-colors"
            >
              Deshabilitar
            </button>
          )
        },
        className: 'w-[120px]',
      },
    ],
    [],
  )

  const activeFilterCount =
    (filters.q.trim() ? 1 : 0) +
    (filters.status !== 'todos' ? 1 : 0) +
    (filters.consent_status !== 'todos' ? 1 : 0) +
    (filters.cohort.trim() ? 1 : 0) +
    (filters.created_from ? 1 : 0) +
    (filters.created_to ? 1 : 0)

  const total = data?.total ?? 0

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Gestion administrativa
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">Usuarios</h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Consulta y administra las cuentas de estudiantes registradas en Mabel IA.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/40">
              Total
            </p>
            <p className="text-xl font-semibold text-text-primary tabular-nums">
              {loading ? '…' : total.toLocaleString('es-CO')}
            </p>
          </div>
        </div>
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
        <div className="flex flex-col gap-1 min-w-[220px] flex-1">
          <label
            htmlFor="filter-q"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Buscar
          </label>
          <input
            id="filter-q"
            type="text"
            value={filters.q}
            onChange={(e) => updateFilter('q', e.target.value)}
            placeholder="Email o nombre"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[140px]">
          <label
            htmlFor="filter-status"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Estado
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value as StatusFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todos</option>
            <option value="active">Activos</option>
            <option value="disabled">Deshabilitados</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[200px]">
          <label
            htmlFor="filter-consent"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Consentimiento
          </label>
          <select
            id="filter-consent"
            value={filters.consent_status}
            onChange={(e) => updateFilter('consent_status', e.target.value as ConsentFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todos</option>
            <option value="ok">Vigente</option>
            <option value="no_consent">Sin consentimiento</option>
            <option value="revoked">Revocado</option>
            <option value="new_version_required">Nueva version requerida</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label
            htmlFor="filter-cohort"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Cohorte
          </label>
          <input
            id="filter-cohort"
            type="text"
            value={filters.cohort}
            onChange={(e) => updateFilter('cohort', e.target.value)}
            placeholder="piloto-fase1"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label
            htmlFor="filter-from"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Registro desde
          </label>
          <input
            id="filter-from"
            type="date"
            value={filters.created_from}
            onChange={(e) => updateFilter('created_from', e.target.value)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label
            htmlFor="filter-to"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Registro hasta
          </label>
          <input
            id="filter-to"
            type="date"
            value={filters.created_to}
            onChange={(e) => updateFilter('created_to', e.target.value)}
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
            onClick={fetchUsers}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable<UserAdminListItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
        emptyMessage={
          activeFilterCount > 0
            ? 'No se encontraron usuarios con los filtros aplicados.'
            : 'Aun no hay usuarios registrados.'
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

      {/* Disable modal */}
      {disableTarget && (
        <DisableUserModal
          open={!!disableTarget}
          userId={disableTarget.id}
          onClose={() => setDisableTarget(null)}
          onDisabled={() => {
            // Refresh list after success; success toast is dispatched inside the modal
            fetchUsers()
            setDisableTarget(null)
          }}
        />
      )}
    </div>
  )
}
