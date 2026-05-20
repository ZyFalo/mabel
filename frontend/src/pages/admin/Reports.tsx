import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import MetricCard from '../../components/admin/MetricCard'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import { useToastStore } from '../../stores/toastStore'

type ReportStatus = 'open' | 'triaged' | 'resolved' | 'dismissed'
type ReportReason = 'hallucination' | 'harmful' | 'privacy' | 'low_empathy' | 'other'

type StatusFilter = 'todos' | ReportStatus
type ReasonFilter = 'todos' | ReportReason
type SeverityFilter = 'todos' | '1' | '2' | '3' | '4' | '5'

interface ReportNoteEntry {
  admin_id?: string | null
  admin_id_truncated?: string | null
  notes?: string | null
  status?: string | null
  at?: string | null
}

interface ReportAdminItem {
  id: string
  message_id: string
  reporter_id_truncated: string
  reason: ReportReason | string
  severity: number
  status: ReportStatus | string
  created_at: string
  triaged_at: string | null
  // The backend may include a notes history array; we render defensively
  notes_history?: ReportNoteEntry[] | null
}

interface ReportsListResponse {
  items: ReportAdminItem[]
  total: number
  page: number
  page_size: number
}

interface FiltersState {
  reason: ReasonFilter
  severity: SeverityFilter
  status: StatusFilter
  from: string
  to: string
}

const DEFAULT_FILTERS: FiltersState = {
  reason: 'todos',
  severity: 'todos',
  status: 'todos',
  from: '',
  to: '',
}

const REASON_LABELS: Record<string, string> = {
  hallucination: 'Alucinacion',
  harmful: 'Contenido danino',
  privacy: 'Privacidad',
  low_empathy: 'Baja empatia',
  other: 'Otro',
}

const REASON_CHIP_CLASSES: Record<string, string> = {
  hallucination: 'bg-warning/10 text-warning border-warning/30',
  harmful: 'bg-danger/10 text-danger border-danger/30',
  privacy: 'bg-accent/10 text-accent border-accent/30',
  low_empathy: 'bg-primary/10 text-primary border-primary/30',
  other: 'bg-gray-100 text-text-primary/70 border-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  triaged: 'Triado',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
}

const STATUS_CHIP_CLASSES: Record<string, string> = {
  open: 'bg-danger/10 text-danger border-danger/30',
  triaged: 'bg-warning/10 text-warning border-warning/30',
  resolved: 'bg-success/10 text-success border-success/30',
  dismissed: 'bg-gray-100 text-text-primary/60 border-gray-300',
}

const SEVERITY_BADGE_CLASSES: Record<number, string> = {
  1: 'bg-success/15 text-success border-success/30',
  2: 'bg-accent/15 text-accent border-accent/30',
  3: 'bg-warning/15 text-warning border-warning/30',
  4: 'bg-[#EA580C]/15 text-[#EA580C] border-[#EA580C]/30',
  5: 'bg-danger/15 text-danger border-danger/30',
}

const TRANSITIONS: Record<string, ReportStatus[]> = {
  open: ['triaged', 'resolved', 'dismissed'],
  triaged: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
}

const ACTION_LABELS: Record<ReportStatus, string> = {
  open: 'Reabrir',
  triaged: 'Marcar como triado',
  resolved: 'Marcar como resuelto',
  dismissed: 'Marcar como descartado',
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

function isSameDay(iso: string, ref: Date): boolean {
  try {
    const d = new Date(iso)
    return (
      d.getFullYear() === ref.getFullYear() &&
      d.getMonth() === ref.getMonth() &&
      d.getDate() === ref.getDate()
    )
  } catch {
    return false
  }
}

function formatAverageDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—'
  const hours = ms / (1000 * 60 * 60)
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(ms / (1000 * 60)))
    return `${minutes} min`
  }
  if (hours < 48) {
    return `${hours.toFixed(1)} h`
  }
  const days = hours / 24
  return `${days.toFixed(1)} d`
}

function ReasonChip({ reason }: { reason: string }) {
  const label = REASON_LABELS[reason] ?? reason
  const cls =
    REASON_CHIP_CLASSES[reason] ?? 'bg-gray-100 text-text-primary/70 border-gray-300'
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

function StatusChip({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const cls =
    STATUS_CHIP_CLASSES[status] ?? 'bg-gray-100 text-text-primary/60 border-gray-300'
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

function SeverityBadge({ severity }: { severity: number }) {
  const cls =
    SEVERITY_BADGE_CLASSES[severity] ?? 'bg-gray-100 text-text-primary/60 border-gray-300'
  return (
    <span
      className={[
        'inline-flex items-center justify-center min-w-[28px] h-[22px] px-1.5 rounded-md text-[11px] font-semibold border tabular-nums',
        cls,
      ].join(' ')}
      aria-label={`Severidad ${severity}`}
    >
      {severity}
    </span>
  )
}

interface ActionFormProps {
  current: string
  reportId: string
  onSuccess: (updated: ReportAdminItem | null) => void
}

function ActionsForm({ current, reportId, onSuccess }: ActionFormProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [selectedTarget, setSelectedTarget] = useState<ReportStatus | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const allowed = TRANSITIONS[current] ?? []

  async function handleSubmit() {
    if (!selectedTarget || submitting) return
    setSubmitting(true)
    try {
      const res = await apiClient.patch<ReportAdminItem>(`/admin/reports/${reportId}`, {
        status: selectedTarget,
        notes: notes.trim() || undefined,
      })
      addToast({
        type: 'success',
        message: `Reporte actualizado a "${STATUS_LABELS[selectedTarget] ?? selectedTarget}".`,
      })
      onSuccess(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      const detail =
        e?.response?.data?.detail ??
        (e?.response?.status === 409
          ? 'Transicion de estado no permitida.'
          : 'No se pudo actualizar el reporte.')
      addToast({ type: 'error', message: detail })
    } finally {
      setSubmitting(false)
    }
  }

  if (allowed.length === 0) {
    return (
      <div className="text-[12px] text-text-primary/50 italic">
        Sin transiciones disponibles para este estado.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mr-1">
          Cambiar estado
        </span>
        {allowed.map((target) => {
          const active = selectedTarget === target
          return (
            <button
              key={target}
              type="button"
              onClick={() => setSelectedTarget(active ? null : target)}
              className={[
                'inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                active
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-text-primary border-gray-300 hover:bg-gray-50 hover:border-primary/40',
              ].join(' ')}
              aria-pressed={active}
            >
              {ACTION_LABELS[target]}
            </button>
          )
        })}
      </div>

      {selectedTarget && (
        <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-md p-3">
          <label
            htmlFor={`notes-${reportId}`}
            className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Notas (opcional)
          </label>
          <textarea
            id={`notes-${reportId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Contexto interno sobre la decision tomada"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedTarget(null)
                setNotes('')
              }}
              className="text-xs text-text-primary/70 hover:text-text-primary px-3 py-1.5"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExpandedDetail({
  row,
  onUpdated,
}: {
  row: ReportAdminItem
  onUpdated: (updated: ReportAdminItem | null) => void
}) {
  const history = row.notes_history ?? []
  return (
    <div className="flex flex-col gap-4">
      {/* Metadata strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Reporte ID
          </p>
          <p className="font-mono text-text-primary/80">{row.id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Mensaje ref.
          </p>
          <p className="font-mono text-text-primary/80">{row.message_id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Reportado
          </p>
          <p className="text-text-primary/80 tabular-nums">{formatDateTime(row.created_at)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Triado
          </p>
          <p className="text-text-primary/80 tabular-nums">{formatDateTime(row.triaged_at)}</p>
        </div>
      </div>

      {/* Notes history */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          Historial de notas
        </p>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-primary/50 italic">
            Aun no hay notas registradas para este reporte.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((entry, i) => (
              <li
                key={i}
                className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px]"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-[11px] text-text-primary/60">
                    {entry.admin_id_truncated ?? entry.admin_id?.slice(0, 8) ?? 'admin'}
                  </span>
                  <span className="text-text-primary/50 tabular-nums text-[11px]">
                    {formatDateTime(entry.at)}
                    {entry.status ? ` · ${STATUS_LABELS[entry.status] ?? entry.status}` : ''}
                  </span>
                </div>
                <p className="text-text-primary whitespace-pre-wrap">
                  {entry.notes ?? <span className="italic text-text-primary/50">(sin texto)</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <ActionsForm current={row.status} reportId={row.id} onSuccess={onUpdated} />

      {/* Privacy disclaimer */}
      <p className="text-[11px] text-text-primary/40 italic border-t border-gray-200 pt-2">
        Por privacidad, el contenido del mensaje reportado no se muestra al administrador.
      </p>
    </div>
  )
}

export default function Reports() {
  const addToast = useToastStore((s) => s.addToast)

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [data, setData] = useState<ReportsListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Indicators (computed via separate sweep with page_size=100)
  const [indicators, setIndicators] = useState<{
    pending: number | null
    reviewedToday: number | null
    avgMs: number | null
  }>({ pending: null, reviewedToday: null, avgMs: null })

  const buildParams = useCallback(
    (extra?: Record<string, string | number>) => {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
        ...(extra ?? {}),
      }
      if (filters.reason !== 'todos') params.reason = filters.reason
      if (filters.severity !== 'todos') params.severity = filters.severity
      if (filters.status !== 'todos') params.status = filters.status
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      return params
    },
    [filters, page, pageSize],
  )

  const fetchReports = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiClient.get<ReportsListResponse>('/admin/reports', {
        params: buildParams(),
      })
      setData(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el listado de reportes.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // Sweep to compute indicators client-side (best-effort; fallback to "-" if it fails)
  const fetchIndicators = useCallback(async () => {
    try {
      const res = await apiClient.get<ReportsListResponse>('/admin/reports', {
        params: { page: 1, page_size: 100 },
      })
      const items = res.data?.items ?? []
      const today = new Date()
      const pending = items.filter((r) => r.status === 'open').length
      const reviewedToday = items.filter(
        (r) => r.triaged_at && isSameDay(r.triaged_at, today),
      ).length
      const triaged = items.filter((r) => r.triaged_at)
      let avgMs: number | null = null
      if (triaged.length > 0) {
        const total = triaged.reduce((acc, r) => {
          const created = new Date(r.created_at).getTime()
          const triagedAt = new Date(r.triaged_at as string).getTime()
          if (!Number.isFinite(created) || !Number.isFinite(triagedAt)) return acc
          return acc + Math.max(0, triagedAt - created)
        }, 0)
        avgMs = total / triaged.length
      }
      setIndicators({ pending, reviewedToday, avgMs })
    } catch {
      setIndicators({ pending: null, reviewedToday: null, avgMs: null })
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  useEffect(() => {
    fetchIndicators()
  }, [fetchIndicators])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  function updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleRowUpdated(updated: ReportAdminItem | null) {
    // Refresh both list and indicators after a successful PATCH
    fetchReports()
    fetchIndicators()
    if (updated) {
      // Optimistic in-place merge if the row is in the current page
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
        }
      })
    }
  }

  const columns: DataTableColumn<ReportAdminItem>[] = useMemo(
    () => [
      {
        key: 'created_at',
        header: 'Fecha',
        sortable: true,
        sortValue: (row) => row.created_at,
        accessor: (row) => (
          <span className="text-sm text-text-primary/80 tabular-nums">
            {formatDateTime(row.created_at)}
          </span>
        ),
        className: 'w-[170px]',
      },
      {
        key: 'reason',
        header: 'Motivo',
        sortable: true,
        sortValue: (row) => row.reason,
        accessor: (row) => <ReasonChip reason={row.reason} />,
        className: 'w-[160px]',
      },
      {
        key: 'severity',
        header: 'Severidad',
        sortable: true,
        sortValue: (row) => row.severity,
        accessor: (row) => <SeverityBadge severity={row.severity} />,
        className: 'w-[110px]',
      },
      {
        key: 'status',
        header: 'Estado',
        sortable: true,
        sortValue: (row) => row.status,
        accessor: (row) => <StatusChip status={row.status} />,
        className: 'w-[130px]',
      },
      {
        key: 'reporter',
        header: 'Reportante',
        accessor: (row) => (
          <span className="font-mono text-[11px] text-text-primary/70 tracking-tight">
            {row.reporter_id_truncated || '—'}
          </span>
        ),
        className: 'w-[130px]',
      },
    ],
    [],
  )

  const activeFilterCount =
    (filters.reason !== 'todos' ? 1 : 0) +
    (filters.severity !== 'todos' ? 1 : 0) +
    (filters.status !== 'todos' ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)

  const total = data?.total ?? 0

  const exportParams = useMemo<Record<string, string | number | undefined>>(() => {
    const p: Record<string, string | number | undefined> = {}
    if (filters.reason !== 'todos') p.reason = filters.reason
    if (filters.severity !== 'todos') p.severity = filters.severity
    if (filters.status !== 'todos') p.status = filters.status
    if (filters.from) p.from = filters.from
    if (filters.to) p.to = filters.to
    return p
  }, [filters])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Moderacion
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">Reportes</h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Triaje y resolucion de reportes de estudiantes sobre respuestas de Mabel IA.
          </p>
        </div>
        <ExportCsvButton
          url="/admin/reports/export.csv"
          params={exportParams}
          filename={`reportes-${new Date().toISOString().slice(0, 10)}.csv`}
          onError={(msg) => addToast({ type: 'error', message: msg })}
        />
      </header>

      {/* Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <MetricCard
          label="Pendientes"
          value={indicators.pending == null ? '—' : indicators.pending.toLocaleString('es-CO')}
          threshold={
            indicators.pending == null
              ? undefined
              : indicators.pending > 0
                ? 'red'
                : 'green'
          }
          hint="Reportes en estado abierto"
        />
        <MetricCard
          label="Revisados hoy"
          value={
            indicators.reviewedToday == null
              ? '—'
              : indicators.reviewedToday.toLocaleString('es-CO')
          }
          hint="Triados o resueltos en la fecha actual"
        />
        <MetricCard
          label="Tiempo promedio"
          value={formatAverageDuration(indicators.avgMs)}
          hint="Desde apertura hasta triaje"
        />
      </div>

      {/* Filters */}
      <FilterBar
        title={
          activeFilterCount > 0
            ? `Filtros (${activeFilterCount} ${activeFilterCount === 1 ? 'activo' : 'activos'})`
            : 'Filtros'
        }
        onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
      >
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label
            htmlFor="filter-reason"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Motivo
          </label>
          <select
            id="filter-reason"
            value={filters.reason}
            onChange={(e) => updateFilter('reason', e.target.value as ReasonFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todos</option>
            <option value="hallucination">Alucinacion</option>
            <option value="harmful">Contenido danino</option>
            <option value="privacy">Privacidad</option>
            <option value="low_empathy">Baja empatia</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[130px]">
          <label
            htmlFor="filter-severity"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Severidad
          </label>
          <select
            id="filter-severity"
            value={filters.severity}
            onChange={(e) => updateFilter('severity', e.target.value as SeverityFilter)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todas</option>
            <option value="1">1 — leve</option>
            <option value="2">2</option>
            <option value="3">3 — media</option>
            <option value="4">4</option>
            <option value="5">5 — critica</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[150px]">
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
            <option value="open">Abierto</option>
            <option value="triaged">Triado</option>
            <option value="resolved">Resuelto</option>
            <option value="dismissed">Descartado</option>
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
            onClick={fetchReports}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable<ReportAdminItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        rowKey={(row) => row.id}
        renderExpanded={(row) => (
          <ExpandedDetail row={row} onUpdated={handleRowUpdated} />
        )}
        emptyMessage={
          activeFilterCount > 0
            ? 'No se encontraron reportes con los filtros aplicados.'
            : 'No hay reportes registrados todavia.'
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
