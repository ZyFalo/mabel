import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import InfoHint from '../../components/admin/InfoHint'
import { useToastStore } from '../../stores/toastStore'

// ============================================================================
// Types
// ============================================================================

// Audit actions, grouped by the role of the actor that performs them.
// Source of truth: `backend/app/services/audit_service.py::ALLOWED_ACTIONS`.
type AdminAction =
  | 'login'
  | 'view_user'
  | 'disable_user'
  | 'enable_user'
  | 'update_cohort'
  | 'change_config'
  | 'update_system_config'
  | 'review_report'
  | 'review_safety_event'
  | 'export_data'
  | 'empathy_rate'

type StudentAction =
  | 'user_register'
  | 'user_login'
  | 'user_delete'
  | 'consent_granted'
  | 'consent_revoked'
  | 'password_reset_requested'
  | 'password_reset_completed'

type SystemAction = 'user_login_failed'

type AuditAction = AdminAction | StudentAction | SystemAction
type ActionFilter = 'todos' | AuditAction
type RoleFilter = 'todos' | 'admin' | 'student' | 'system'

interface AuditLogItem {
  id: string
  actor_id: string | null
  actor_role: 'admin' | 'student' | 'system' | string
  actor_email_masked: string | null
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
  actor: string
  actor_role: RoleFilter
  action: ActionFilter
  from: string
  to: string
}

const DEFAULT_FILTERS: FiltersState = {
  actor: '',
  actor_role: 'todos',
  action: 'todos',
  from: '',
  to: '',
}

// ============================================================================
// Labels and styling
// ============================================================================

const ACTION_LABELS: Record<string, string> = {
  // Admin actions
  login: 'Inicio de sesión (admin)',
  view_user: 'Ver usuario',
  disable_user: 'Deshabilitar usuario',
  enable_user: 'Reactivar usuario',
  update_cohort: 'Asignar cohorte',
  change_config: 'Cambio de config',
  update_system_config: 'Actualizar config',
  review_report: 'Revisar reporte',
  review_safety_event: 'Revisar evento SOS',
  export_data: 'Exportar datos',
  empathy_rate: 'Calificar empatía',
  // Student-originated actions
  user_register: 'Registro de cuenta',
  user_login: 'Inicio de sesión (estudiante)',
  user_delete: 'Eliminación de cuenta',
  consent_granted: 'Consentimiento aceptado',
  consent_revoked: 'Consentimiento revocado',
  password_reset_requested: 'Solicitud reset contraseña',
  password_reset_completed: 'Reset contraseña completado',
  // System events
  user_login_failed: 'Login fallido',
}

const ACTION_CHIP_STYLES: Record<string, React.CSSProperties> = {
  // Admin
  login: { background: 'var(--ink-100)', color: 'var(--ink-700)', borderColor: 'var(--ink-200)' },
  view_user: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37,99,235,0.25)' },
  disable_user: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  enable_user: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  update_cohort: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37,99,235,0.25)' },
  change_config: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  update_system_config: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  review_report: { background: 'var(--mabel-50)', color: 'var(--mabel-700)', borderColor: 'var(--mabel-200)' },
  review_safety_event: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  export_data: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  empathy_rate: { background: 'var(--mabel-50)', color: 'var(--mabel-700)', borderColor: 'var(--mabel-200)' },
  // Student
  user_register: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  user_login: { background: 'var(--ink-100)', color: 'var(--ink-700)', borderColor: 'var(--ink-200)' },
  user_delete: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  consent_granted: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  consent_revoked: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  password_reset_requested: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37,99,235,0.25)' },
  password_reset_completed: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37,99,235,0.25)' },
  // System
  user_login_failed: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  student: 'Estudiante',
  system: 'Sistema',
}

const ROLE_CHIP_STYLES: Record<string, React.CSSProperties> = {
  admin: { background: 'var(--mabel-50)', color: 'var(--mabel-700)', borderColor: 'var(--mabel-200)' },
  student: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37,99,235,0.25)' },
  system: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
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

function chipStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
    letterSpacing: '0.01em',
    ...extra,
  }
}

function ActionChip({ action }: { action: string }) {
  const label = ACTION_LABELS[action] ?? action
  const style = ACTION_CHIP_STYLES[action] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-700)',
    borderColor: 'var(--ink-200)',
  }
  return <span style={chipStyle(style)}>{label}</span>
}

function RoleChip({ role }: { role: string }) {
  const label = ROLE_LABEL[role] ?? role
  const style = ROLE_CHIP_STYLES[role] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-700)',
    borderColor: 'var(--ink-200)',
  }
  return <span style={chipStyle(style)}>{label}</span>
}

function ExpandedDetail({ row }: { row: AuditLogItem }) {
  const fullJson = useMemo(() => {
    const payload = {
      id: row.id,
      action: row.action,
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      actor_email_masked: row.actor_email_masked,
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Log ID
          </p>
          <p className="font-mono text-text-primary/80">{row.id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Actor
          </p>
          <p className="font-mono text-text-primary/80">
            {row.actor_email_masked ?? row.actor_id?.slice(0, 8) ?? '— (sistema)'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Rol
          </p>
          <RoleChip role={row.actor_role} />
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
        Los registros de auditoría son append-only. No es posible editar ni eliminar entradas. La
        FK <code>actor_id ON DELETE SET NULL</code> preserva el log incluso si el usuario fue
        eliminado.
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
      if (filters.actor.trim()) params.actor_id = filters.actor.trim()
      if (filters.actor_role !== 'todos') params.actor_role = filters.actor_role
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
      setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el registro de auditoría.')
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
        key: 'actor',
        header: 'Actor',
        accessor: (row) => (
          <span className="font-mono text-[12px] text-text-primary/80 tracking-tight">
            {row.actor_email_masked ?? row.actor_id?.slice(0, 8) ?? '— (sistema)'}
          </span>
        ),
        className: 'w-[200px]',
      },
      {
        key: 'role',
        header: 'Rol',
        sortable: true,
        sortValue: (row) => row.actor_role,
        accessor: (row) => <RoleChip role={row.actor_role} />,
        className: 'w-[110px]',
      },
      {
        key: 'action',
        header: 'Acción',
        sortable: true,
        sortValue: (row) => row.action,
        accessor: (row) => <ActionChip action={row.action} />,
        className: 'w-[200px]',
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
    (filters.actor.trim() ? 1 : 0) +
    (filters.actor_role !== 'todos' ? 1 : 0) +
    (filters.action !== 'todos' ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)

  const exportParams = useMemo<Record<string, string | number | undefined>>(() => {
    const p: Record<string, string | number | undefined> = {}
    if (filters.actor.trim()) p.actor_id = filters.actor.trim()
    if (filters.actor_role !== 'todos') p.actor_role = filters.actor_role
    if (filters.action !== 'todos') p.action = filters.action
    if (filters.from) p.from = filters.from
    if (filters.to) p.to = filters.to
    return p
  }, [filters])

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
            Auditoría
          </p>
          <div className="flex items-center" style={{ gap: 8 }}>
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
              Registro de auditoría
            </h1>
            <InfoHint text="Bitácora append-only de acciones con intencionalidad humana o eventos críticos: acciones de admin (gestión, exports), de estudiante (registro, consent, eliminación, reset contraseña, login) y de sistema (intentos fallidos). Los mensajes a Mabel y los safety_events viven en sus propias tablas, no aquí." />
          </div>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ink-500)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Bitácora inmutable. Append-only por diseño. Incluye acciones de admin, estudiante y
            sistema.
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
            htmlFor="filter-actor"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Actor (email o ID)
          </label>
          <input
            id="filter-actor"
            type="text"
            value={filters.actor}
            onChange={(e) => updateFilter('actor', e.target.value)}
            placeholder="admin@umb o uuid"
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
          <label
            htmlFor="filter-role"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Rol
          </label>
          <select
            id="filter-role"
            value={filters.actor_role}
            onChange={(e) => updateFilter('actor_role', e.target.value as RoleFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todos</option>
            <option value="admin">Admin</option>
            <option value="student">Estudiante</option>
            <option value="system">Sistema</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[210px]">
          <label
            htmlFor="filter-action"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Acción
          </label>
          <select
            id="filter-action"
            value={filters.action}
            onChange={(e) => updateFilter('action', e.target.value as ActionFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todas</option>
            <optgroup label="Admin">
              <option value="login">{ACTION_LABELS.login}</option>
              <option value="view_user">{ACTION_LABELS.view_user}</option>
              <option value="disable_user">{ACTION_LABELS.disable_user}</option>
              <option value="enable_user">{ACTION_LABELS.enable_user}</option>
              <option value="update_cohort">{ACTION_LABELS.update_cohort}</option>
              <option value="change_config">{ACTION_LABELS.change_config}</option>
              <option value="update_system_config">
                {ACTION_LABELS.update_system_config}
              </option>
              <option value="review_report">{ACTION_LABELS.review_report}</option>
              <option value="review_safety_event">
                {ACTION_LABELS.review_safety_event}
              </option>
              <option value="export_data">{ACTION_LABELS.export_data}</option>
              <option value="empathy_rate">{ACTION_LABELS.empathy_rate}</option>
            </optgroup>
            <optgroup label="Estudiante">
              <option value="user_register">{ACTION_LABELS.user_register}</option>
              <option value="user_login">{ACTION_LABELS.user_login}</option>
              <option value="user_delete">{ACTION_LABELS.user_delete}</option>
              <option value="consent_granted">{ACTION_LABELS.consent_granted}</option>
              <option value="consent_revoked">{ACTION_LABELS.consent_revoked}</option>
              <option value="password_reset_requested">
                {ACTION_LABELS.password_reset_requested}
              </option>
              <option value="password_reset_completed">
                {ACTION_LABELS.password_reset_completed}
              </option>
            </optgroup>
            <optgroup label="Sistema">
              <option value="user_login_failed">{ACTION_LABELS.user_login_failed}</option>
            </optgroup>
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
            onClick={fetchLogs}
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
            : 'No hay registros de auditoría todavía.'
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
