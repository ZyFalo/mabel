import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import { useToastStore } from '../../stores/toastStore'

type EventStatus = 'active' | 'reviewed' | 'resolved'
type StatusFilter = 'todos' | EventStatus
type SeverityFilter = 'todos' | '1' | '2' | '3' | '4' | '5'

interface SafetyEventNoteEntry {
  admin_id?: string | null
  admin_id_truncated?: string | null
  notes?: string | null
  status?: string | null
  at?: string | null
}

interface SafetyEventAdminItem {
  id: string
  event_type: string
  session_id_truncated: string | null
  severity: number | null
  status: EventStatus | string
  created_at: string
  payload: Record<string, unknown> | null
  notes_history?: SafetyEventNoteEntry[] | null
}

interface SafetyEventsListResponse {
  items: SafetyEventAdminItem[]
  total: number
  page: number
  page_size: number
}

interface FiltersState {
  event_type: string
  severity: SeverityFilter
  status: StatusFilter
  from: string
  to: string
}

const DEFAULT_FILTERS: FiltersState = {
  event_type: '',
  severity: 'todos',
  status: 'todos',
  from: '',
  to: '',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  reviewed: 'Revisado',
  resolved: 'Resuelto',
}

const STATUS_CHIP_CLASSES: Record<string, string> = {
  active: 'bg-danger/10 text-danger border-danger/30',
  reviewed: 'bg-warning/10 text-warning border-warning/30',
  resolved: 'bg-success/10 text-success border-success/30',
}

const SEVERITY_BADGE_CLASSES: Record<number, string> = {
  1: 'bg-success/15 text-success border-success/30',
  2: 'bg-accent/15 text-accent border-accent/30',
  3: 'bg-warning/15 text-warning border-warning/30',
  4: 'bg-[#EA580C]/15 text-[#EA580C] border-[#EA580C]/30',
  5: 'bg-danger/15 text-danger border-danger/30',
}

const TRANSITIONS: Record<string, EventStatus[]> = {
  active: ['reviewed'],
  reviewed: ['resolved'],
  resolved: [],
}

const ACTION_LABELS: Record<EventStatus, string> = {
  active: 'Reactivar',
  reviewed: 'Marcar como revisado',
  resolved: 'Marcar como resuelto',
}

// Defensive denylist: keys that, if ever present in payload, should NOT be rendered.
// D-03: admin never sees message content. The backend should already exclude these,
// but we filter on the frontend as a second line of defense.
const REDACTED_KEYS = new Set([
  'content',
  'message',
  'message_content',
  'user_content',
  'assistant_content',
  'text',
  'transcript',
])

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

function sanitizePayload(input: unknown): unknown {
  if (input == null) return input
  if (Array.isArray(input)) return input.map(sanitizePayload)
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (REDACTED_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTADO]'
      } else {
        out[k] = sanitizePayload(v)
      }
    }
    return out
  }
  return input
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

function SeverityBadge({ severity }: { severity: number | null }) {
  if (severity == null) {
    return <span className="text-text-primary/40 text-sm">—</span>
  }
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

function EventTypeChip({ eventType }: { eventType: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-accent/10 text-accent border-accent/30 tracking-wide font-mono">
      {eventType}
    </span>
  )
}

interface ActionFormProps {
  current: string
  eventId: string
  onSuccess: (updated: SafetyEventAdminItem | null) => void
}

function ActionsForm({ current, eventId, onSuccess }: ActionFormProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [selectedTarget, setSelectedTarget] = useState<EventStatus | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const allowed = TRANSITIONS[current] ?? []

  async function handleSubmit() {
    if (!selectedTarget || submitting) return
    setSubmitting(true)
    try {
      const res = await apiClient.patch<SafetyEventAdminItem>(
        `/admin/safety-events/${eventId}`,
        {
          status: selectedTarget,
          notes: notes.trim() || undefined,
        },
      )
      addToast({
        type: 'success',
        message: `Evento actualizado a "${STATUS_LABELS[selectedTarget] ?? selectedTarget}".`,
      })
      onSuccess(res.data ?? null)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      const detail =
        e?.response?.data?.detail ??
        (e?.response?.status === 409
          ? 'Transicion de estado no permitida.'
          : 'No se pudo actualizar el evento de seguridad.')
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
            htmlFor={`notes-${eventId}`}
            className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Notas (opcional)
          </label>
          <textarea
            id={`notes-${eventId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Contexto interno sobre la revision realizada"
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
  row: SafetyEventAdminItem
  onUpdated: (updated: SafetyEventAdminItem | null) => void
}) {
  const history = row.notes_history ?? []
  const sanitized = useMemo(() => sanitizePayload(row.payload ?? {}), [row.payload])
  const prettyJson = useMemo(() => {
    try {
      return JSON.stringify(sanitized, null, 2)
    } catch {
      return '{}'
    }
  }, [sanitized])

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Evento ID
          </p>
          <p className="font-mono text-text-primary/80">{row.id.slice(0, 8)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Sesion
          </p>
          <p className="font-mono text-text-primary/80">
            {row.session_id_truncated ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Tipo
          </p>
          <p className="font-mono text-text-primary/80">{row.event_type}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/50">
            Registrado
          </p>
          <p className="text-text-primary/80 tabular-nums">
            {formatDateTime(row.created_at)}
          </p>
        </div>
      </div>

      {/* Payload */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          Payload (sanitizado)
        </p>
        <pre className="bg-[#0F303A] text-[#E0F2F1] text-[12px] leading-relaxed rounded-md px-4 py-3 overflow-auto max-h-[320px] font-mono whitespace-pre">
          {prettyJson}
        </pre>
      </div>

      {/* Notes history */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          Historial de revisiones
        </p>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-primary/50 italic">
            Aun no hay revisiones registradas para este evento.
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
      <ActionsForm current={row.status} eventId={row.id} onSuccess={onUpdated} />

      {/* Privacy disclaimer */}
      <p className="text-[11px] text-text-primary/40 italic border-t border-gray-200 pt-2">
        El contenido del mensaje que activo el evento no se expone al administrador.
      </p>
    </div>
  )
}

export default function SafetyEvents() {
  const addToast = useToastStore((s) => s.addToast)

  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [data, setData] = useState<SafetyEventsListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = {
      page,
      page_size: pageSize,
    }
    if (filters.event_type.trim()) params.event_type = filters.event_type.trim()
    if (filters.severity !== 'todos') params.severity = filters.severity
    if (filters.status !== 'todos') params.status = filters.status
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    return params
  }, [filters, page, pageSize])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiClient.get<SafetyEventsListResponse>('/admin/safety-events', {
        params: buildParams(),
      })
      setData(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setErrorMsg(
        e?.response?.data?.detail ?? 'No se pudo cargar el listado de eventos de seguridad.',
      )
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  function updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function handleRowUpdated(updated: SafetyEventAdminItem | null) {
    fetchEvents()
    if (updated) {
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
        }
      })
    }
  }

  const columns: DataTableColumn<SafetyEventAdminItem>[] = useMemo(
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
        key: 'event_type',
        header: 'Tipo evento',
        sortable: true,
        sortValue: (row) => row.event_type,
        accessor: (row) => <EventTypeChip eventType={row.event_type} />,
        className: 'w-[200px]',
      },
      {
        key: 'severity',
        header: 'Severidad',
        sortable: true,
        sortValue: (row) => row.severity ?? -1,
        accessor: (row) => <SeverityBadge severity={row.severity} />,
        className: 'w-[110px]',
      },
      {
        key: 'session',
        header: 'Sesion',
        accessor: (row) => (
          <span className="font-mono text-[11px] text-text-primary/70 tracking-tight">
            {row.session_id_truncated ?? '—'}
          </span>
        ),
        className: 'w-[130px]',
      },
      {
        key: 'status',
        header: 'Estado',
        sortable: true,
        sortValue: (row) => row.status,
        accessor: (row) => <StatusChip status={row.status} />,
        className: 'w-[130px]',
      },
    ],
    [],
  )

  const activeFilterCount =
    (filters.event_type.trim() ? 1 : 0) +
    (filters.severity !== 'todos' ? 1 : 0) +
    (filters.status !== 'todos' ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0)

  const total = data?.total ?? 0

  const exportParams = useMemo<Record<string, string | number | undefined>>(() => {
    const p: Record<string, string | number | undefined> = {}
    if (filters.event_type.trim()) p.event_type = filters.event_type.trim()
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
            Seguridad
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">Eventos de seguridad</h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Eventos generados por el sistema de guardrails y deteccion de riesgo.
          </p>
        </div>
        <ExportCsvButton
          url="/admin/safety-events/export.csv"
          params={exportParams}
          filename={`safety-events-${new Date().toISOString().slice(0, 10)}.csv`}
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
        <div className="flex flex-col gap-1 min-w-[220px] flex-1">
          <label
            htmlFor="filter-event-type"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Tipo evento
          </label>
          <input
            id="filter-event-type"
            type="text"
            value={filters.event_type}
            onChange={(e) => updateFilter('event_type', e.target.value)}
            placeholder="risk_detected, redirect_shown, ..."
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
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
            <option value="active">Activo</option>
            <option value="reviewed">Revisado</option>
            <option value="resolved">Resuelto</option>
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
            onClick={fetchEvents}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <DataTable<SafetyEventAdminItem>
        columns={columns}
        rows={data?.items ?? []}
        loading={loading}
        rowKey={(row) => row.id}
        renderExpanded={(row) => (
          <ExpandedDetail row={row} onUpdated={handleRowUpdated} />
        )}
        emptyMessage={
          activeFilterCount > 0
            ? 'No se encontraron eventos con los filtros aplicados.'
            : 'No hay eventos de seguridad registrados todavia.'
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
