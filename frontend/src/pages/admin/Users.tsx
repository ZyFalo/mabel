import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import BulkActionModal, {
  type BulkActionUser,
} from '../../components/admin/BulkActionModal'
import DisableUserModal from '../../components/admin/DisableUserModal'
import EnableUserModal from '../../components/admin/EnableUserModal'
import { useToastStore } from '../../stores/toastStore'

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
  new_version_required: 'Nueva versión requerida',
}

const CONSENT_CHIP_STYLES: Record<string, React.CSSProperties> = {
  ok: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  no_consent: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
  revoked: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  new_version_required: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
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
  const style = CONSENT_CHIP_STYLES[status] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-600)',
    borderColor: 'var(--ink-200)',
  }
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '2px 9px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        border: '1px solid',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  )
}

function StatusBadge({ disabled }: { disabled: boolean }) {
  if (disabled) {
    return (
      <span
        className="inline-flex items-center"
        style={{
          gap: 6,
          fontSize: 11.5,
          color: 'var(--ink-500)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--ink-300)',
            display: 'inline-block',
          }}
        />
        Deshabilitada
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontSize: 11.5,
        color: 'var(--success-700)',
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--success-600)',
          display: 'inline-block',
        }}
      />
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
  const [enableTarget, setEnableTarget] = useState<UserAdminListItem | null>(null)

  // Multi-select: rows currently checked by the admin (by user.id). Stored as
  // a Set for O(1) lookup. Admins are never selectable (the row's checkbox
  // is hidden) so the set only contains student IDs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Cohort dropdown open state for the action bar.
  const [cohortMenuOpen, setCohortMenuOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  // Action picker (disable/enable/delete) for the bulk bar.
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  // Open BulkActionModal in one of the three lifecycle modes when not null.
  const [bulkActionMode, setBulkActionMode] =
    useState<'disable' | 'enable' | 'delete' | null>(null)

  // Distinct cohorts loaded once for the cohort filter. Same source as the
  // Métricas + EmpathyRatings pages — when an admin assigns a cohort to a
  // user (via /admin/users/:id) it shows up here automatically on reload.
  const [cohorts, setCohorts] = useState<string[]>([])
  const [cohortsLoaded, setCohortsLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    apiClient
      .get<string[]>('/admin/users/cohorts')
      .then((res) => {
        if (cancelled) return
        setCohorts(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (cancelled) return
        setCohorts([])
      })
      .finally(() => {
        if (!cancelled) setCohortsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cohortOptions = useMemo(() => {
    const set = new Set(cohorts)
    if (filters.cohort) set.add(filters.cohort)
    return Array.from(set).sort()
  }, [cohorts, filters.cohort])
  const addToast = useToastStore((s) => s.addToast)

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

  // Opens the EnableUserModal for the row. The modal owns the PATCH +
  // toast lifecycle (mirrors DisableUserModal); we just refresh the list
  // when it reports success via `onEnabled`.
  function openEnableModal(user: UserAdminListItem) {
    setEnableTarget(user)
  }

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  // -------------------- Multi-select helpers --------------------

  // Rows the current page actually exposes a checkbox for (admins excluded).
  const selectableRows = useMemo(
    () => (data?.items ?? []).filter((u) => u.role !== 'admin'),
    [data],
  )

  const allSelectedInPage =
    selectableRows.length > 0 &&
    selectableRows.every((u) => selectedIds.has(u.id))
  const someSelectedInPage =
    !allSelectedInPage && selectableRows.some((u) => selectedIds.has(u.id))

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllInPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const ids = selectableRows.map((u) => u.id)
      const allInside = ids.every((id) => next.has(id))
      if (allInside) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setCohortMenuOpen(false)
  }

  // -------------------- Bulk actions --------------------

  async function applyBulkCohort(cohort: string | null, cohortLabel: string) {
    if (selectedIds.size === 0 || bulkSubmitting) return
    setBulkSubmitting(true)
    setCohortMenuOpen(false)
    try {
      const res = await apiClient.patch<{
        updated: number
        unchanged: number
        not_found: string[]
        skipped_admin: string[]
      }>('/admin/users/cohort/bulk', {
        user_ids: Array.from(selectedIds),
        cohort,
      })
      const r = res.data
      const summary: string[] = []
      if (r.updated > 0) summary.push(`${r.updated} actualizados`)
      if (r.unchanged > 0) summary.push(`${r.unchanged} sin cambios`)
      if (r.skipped_admin.length > 0)
        summary.push(`${r.skipped_admin.length} admin omitido(s)`)
      if (r.not_found.length > 0)
        summary.push(`${r.not_found.length} no encontrado(s)`)
      addToast({
        type: 'success',
        message: `Cohorte "${cohortLabel}": ${summary.join(' · ') || 'sin cambios'}.`,
      })
      clearSelection()
      fetchUsers()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo asignar la cohorte.',
      })
    } finally {
      setBulkSubmitting(false)
    }
  }

  // Rows in the current page that match `selectedIds`. Passed to the
  // BulkActionModal so it can render an honest split preview without doing
  // its own fetch. NOTE: if the admin selects users across pages this only
  // shows the ones currently loaded. For the pilot scale (≤30 students,
  // page_size 20) this is acceptable; the backend still validates against
  // the real state of each user.
  const selectedRows: BulkActionUser[] = useMemo(() => {
    const items = data?.items ?? []
    return items.filter((u) => selectedIds.has(u.id))
  }, [data, selectedIds])

  function handleBulkActionApplied(res: {
    action: 'disable' | 'enable' | 'delete'
    applied: number
    skipped_admin: string[]
    skipped_already_state: string[]
    skipped_must_disable_first: string[]
    not_found: string[]
  }) {
    const parts: string[] = []
    const verbApplied =
      res.action === 'disable'
        ? 'deshabilitada(s)'
        : res.action === 'enable'
          ? 'reactivada(s)'
          : 'eliminada(s)'
    if (res.applied > 0) parts.push(`${res.applied} ${verbApplied}`)
    if (res.skipped_already_state.length > 0)
      parts.push(`${res.skipped_already_state.length} ya estaban en ese estado`)
    if (res.skipped_must_disable_first.length > 0)
      parts.push(
        `${res.skipped_must_disable_first.length} requerían deshabilitarse primero`,
      )
    if (res.skipped_admin.length > 0)
      parts.push(`${res.skipped_admin.length} admin omitido(s)`)
    if (res.not_found.length > 0)
      parts.push(`${res.not_found.length} no encontrado(s)`)
    addToast({
      type: res.applied > 0 ? 'success' : 'warning',
      message: parts.join(' · ') || 'Sin cambios.',
    })
    clearSelection()
    fetchUsers()
  }

  function promptNewCohortAndApply() {
    setCohortMenuOpen(false)
    const raw = window.prompt(
      'Nombre de la nueva cohorte (ej. piloto-fase2, control). Usa minúsculas y guiones.',
      '',
    )
    if (raw === null) return
    const cohort = raw.trim()
    if (!cohort) {
      addToast({ type: 'warning', message: 'Nombre vacío, se cancela.' })
      return
    }
    if (cohort.length > 64) {
      addToast({ type: 'error', message: 'Máximo 64 caracteres.' })
      return
    }
    applyBulkCohort(cohort, cohort)
  }

  function updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const columns: DataTableColumn<UserAdminListItem>[] = useMemo(
    () => [
      {
        key: '_select',
        header: (
          // Header checkbox: "select all in current page". Three states:
          // unchecked (none selected), indeterminate (some), checked (all).
          // Admins are silently excluded from "all" — they are never
          // selectable, so the count only reflects students on the page.
          <input
            type="checkbox"
            aria-label="Seleccionar todos los estudiantes en la página"
            checked={allSelectedInPage}
            ref={(el) => {
              if (el) el.indeterminate = someSelectedInPage
            }}
            onChange={(e) => {
              e.stopPropagation()
              toggleAllInPage()
            }}
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer"
            style={{ accentColor: 'var(--mabel-600)' }}
          />
        ) as unknown as string,
        accessor: (row) => {
          if (row.role === 'admin') {
            return (
              <span
                aria-hidden
                className="inline-block w-3.5 h-3.5"
                title="Las cuentas administrativas no se pueden seleccionar"
              />
            )
          }
          const checked = selectedIds.has(row.id)
          return (
            <input
              type="checkbox"
              aria-label={`Seleccionar ${row.email_masked}`}
              checked={checked}
              onChange={(e) => {
                e.stopPropagation()
                toggleRow(row.id)
              }}
              onClick={(e) => e.stopPropagation()}
              className="cursor-pointer"
              style={{ accentColor: 'var(--mabel-600)' }}
            />
          )
        },
        className: 'w-[36px]',
      },
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
            <span
              className="inline-flex items-center"
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--ink-100)',
                color: 'var(--ink-700)',
                border: '1px solid var(--ink-200)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                letterSpacing: '-0.01em',
              }}
            >
              {row.cohort}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>—</span>
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
        header: 'Último acceso',
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
          // Admins never expose a disable/enable button — protects the
          // staff account from being locked out by another admin.
          if (isAdmin) {
            return <span className="text-[11px] text-text-primary/30">—</span>
          }
          if (isDisabled) {
            // No spinner inline: EnableUserModal owns the busy state and
            // dispatches the success toast. The cell simply opens it.
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openEnableModal(row)
                }}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: 'var(--success-700)',
                  background: 'transparent',
                  border: '1px solid var(--success-200)',
                  padding: '4px 12px',
                  borderRadius: 9999,
                  cursor: 'pointer',
                  transition:
                    'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = 'var(--success-50)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.background = 'transparent')
                }
              >
                Activar
              </button>
            )
          }
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDisableTarget(row)
              }}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--danger-700)',
                background: 'transparent',
                border: '1px solid var(--danger-200)',
                padding: '4px 12px',
                borderRadius: 9999,
                cursor: 'pointer',
                transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-50)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--danger-700)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--danger-700)'
              }}
            >
              Deshabilitar
            </button>
          )
        },
        className: 'w-[120px]',
      },
    ],
    // `enablingId` flips the spinner state on the "Activar" cell — re-bake
    // the columns when it changes so the disabled state stays in sync.
    // Re-bake the columns whenever the selection set changes. The checkbox
    // accessors capture `selectedIds` / `allSelectedInPage` /
    // `someSelectedInPage`; without them as deps the memoized columns
    // would keep rendering `checked={false}` against a stale closure even
    // when the bulk-action bar already saw the update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, allSelectedInPage, someSelectedInPage],
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
    <div
      className="fade-in"
      style={{
        padding: 32,
        maxWidth: 1440,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header
        className="flex items-end justify-between flex-wrap"
        style={{ gap: 16, marginBottom: 24 }}
      >
        <div>
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--mabel-700)',
              opacity: 0.85,
              margin: 0,
            }}
          >
            Gestión administrativa
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--ink-900)',
              marginTop: 6,
              marginBottom: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Usuarios
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ink-500)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Consulta y administra las cuentas de estudiantes registradas en Mabel IA.
          </p>
        </div>
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--ink-200)',
            borderRadius: 'var(--r-lg)',
            padding: '10px 18px',
            textAlign: 'right',
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--ink-500)',
              margin: 0,
            }}
          >
            Total
          </p>
          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--ink-900)',
              fontVariantNumeric: 'tabular-nums',
              margin: 0,
              marginTop: 2,
              letterSpacing: '-0.02em',
            }}
          >
            {loading ? '…' : total.toLocaleString('es-CO')}
          </p>
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
            <option value="new_version_required">Nueva versión requerida</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[170px]">
          <label
            htmlFor="filter-cohort"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Cohorte
          </label>
          <select
            id="filter-cohort"
            value={filters.cohort}
            onChange={(e) => updateFilter('cohort', e.target.value)}
            disabled={!cohortsLoaded}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
          >
            <option value="">Todas</option>
            {cohortOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
          style={{
            marginBottom: 16,
            border: '1px solid var(--danger-200)',
            background: 'var(--danger-50)',
            borderRadius: 'var(--r-lg)',
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--danger-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchUsers}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--danger-700)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Bulk action bar — sticky above the table when any row is selected.
          Surfaces "N seleccionados" + an "Asignar cohorte ▾" dropdown with
          existing cohorts plus "Nueva cohorte…" and "Quitar cohorte". Other
          bulk actions (disable/enable/delete) will plug into this same bar
          in the next task — keeping the bar in place now avoids a layout
          shift when those actions land. */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Acciones en lote"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--mabel-50)',
            border: '1px solid var(--mabel-200)',
            borderRadius: 'var(--r-lg)',
            padding: '10px 14px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="flex flex-col" style={{ gap: 2 }}>
            <span
              className="font-semibold text-text-primary"
              style={{ fontSize: 13 }}
            >
              {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--ink-500)',
                lineHeight: 1.3,
              }}
            >
              Click sobre una fila para alternar la selección. Limpia la
              selección para abrir el detalle de un usuario.
            </span>
          </div>

          {/* Cohorte dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setCohortMenuOpen((v) => !v)}
              disabled={bulkSubmitting}
              aria-haspopup="menu"
              aria-expanded={cohortMenuOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50 disabled:opacity-60"
            >
              {bulkSubmitting ? 'Aplicando…' : 'Asignar cohorte'}
              <span aria-hidden style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
            </button>
            {cohortMenuOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--white)',
                  border: '1px solid var(--ink-200)',
                  borderRadius: 'var(--r-md)',
                  boxShadow:
                    '0 8px 24px -6px rgba(26, 17, 16, 0.18), 0 4px 8px -2px rgba(26, 17, 16, 0.10)',
                  minWidth: 200,
                  padding: '6px 0',
                  zIndex: 20,
                }}
              >
                {cohortOptions.length === 0 && (
                  <div
                    style={{
                      padding: '6px 12px',
                      fontSize: 11,
                      color: 'var(--ink-500)',
                      fontStyle: 'italic',
                    }}
                  >
                    Aún no hay cohortes creadas.
                  </div>
                )}
                {cohortOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    onClick={() => applyBulkCohort(c, c)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 12px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--ink-900)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'var(--ink-50)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background =
                        'transparent')
                    }
                  >
                    {c}
                  </button>
                ))}
                <div
                  style={{
                    borderTop: '1px solid var(--ink-100)',
                    margin: '6px 0',
                  }}
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={promptNewCohortAndApply}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--mabel-700)',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--mabel-50)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'transparent')
                  }
                >
                  + Nueva cohorte…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => applyBulkCohort(null, 'sin cohorte')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--danger-700)',
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--danger-50)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'transparent')
                  }
                >
                  Quitar cohorte
                </button>
              </div>
            )}
          </div>

          {/* Lifecycle actions dropdown (disable / enable / delete) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setActionMenuOpen((v) => !v)}
              disabled={bulkSubmitting}
              aria-haspopup="menu"
              aria-expanded={actionMenuOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50 disabled:opacity-60"
            >
              Acciones
              <span aria-hidden style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
            </button>
            {actionMenuOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--white)',
                  border: '1px solid var(--ink-200)',
                  borderRadius: 'var(--r-md)',
                  boxShadow:
                    '0 8px 24px -6px rgba(26, 17, 16, 0.18), 0 4px 8px -2px rgba(26, 17, 16, 0.10)',
                  minWidth: 220,
                  padding: '6px 0',
                  zIndex: 20,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenuOpen(false)
                    setBulkActionMode('disable')
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--danger-700)',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--danger-50)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'transparent')
                  }
                >
                  Deshabilitar seleccionados…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenuOpen(false)
                    setBulkActionMode('enable')
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--success-700)',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--success-50)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'transparent')
                  }
                >
                  Reactivar seleccionados
                </button>
                <div
                  style={{
                    borderTop: '1px solid var(--ink-100)',
                    margin: '6px 0',
                  }}
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionMenuOpen(false)
                    setBulkActionMode('delete')
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--danger-700)',
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--danger-50)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'transparent')
                  }
                >
                  Eliminar permanentemente…
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkSubmitting}
            className="ml-auto inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-text-primary/70 hover:text-text-primary hover:bg-white/70 disabled:opacity-60"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable<UserAdminListItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        rowKey={(row) => row.id}
        // UX: si hay selección activa, click sobre una fila TOGGLE su
        // estado (patrón Gmail) en lugar de navegar al detalle —
        // evita perder la selección por accidente al apuntar mal el
        // checkbox. Para administradores (no seleccionables) seguimos
        // navegando al detalle aunque haya selección activa.
        onRowClick={(row) => {
          if (selectedIds.size > 0 && row.role !== 'admin') {
            toggleRow(row.id)
            return
          }
          navigate(`/admin/users/${row.id}`)
        }}
        emptyMessage={
          activeFilterCount > 0
            ? 'No se encontraron usuarios con los filtros aplicados.'
            : 'Aún no hay usuarios registrados.'
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

      {/* Enable modal */}
      {enableTarget && (
        <EnableUserModal
          open={!!enableTarget}
          userId={enableTarget.id}
          userLabel={enableTarget.display_name?.trim() || enableTarget.email_masked}
          onClose={() => setEnableTarget(null)}
          onEnabled={() => {
            fetchUsers()
            setEnableTarget(null)
          }}
        />
      )}

      {/* Bulk lifecycle action modal */}
      {bulkActionMode && (
        <BulkActionModal
          open={!!bulkActionMode}
          action={bulkActionMode}
          selected={selectedRows}
          onClose={() => setBulkActionMode(null)}
          onApplied={handleBulkActionApplied}
        />
      )}
    </div>
  )
}
