import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../../api/client'
import DataTable, { DataTableColumn } from '../../components/admin/DataTable'
import FilterBar from '../../components/admin/FilterBar'
import Pagination from '../../components/admin/Pagination'
import MetricCard from '../../components/admin/MetricCard'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import { useToastStore } from '../../stores/toastStore'
import { SEVERITY_LABELS, severityLong } from '../../utils/severity'

type ReportStatus = 'open' | 'triaged' | 'resolved' | 'dismissed'
type ReportReason = 'hallucination' | 'harmful' | 'privacy' | 'low_empathy' | 'other'

type StatusFilter = 'todos' | ReportStatus
type ReasonFilter = 'todos' | ReportReason
type SeverityFilter = 'todos' | '1' | '2' | '3' | '4' | '5'

interface ReportNoteEntry {
  // Backend `_split_details` parses lines `[ISO_timestamp] <status>: <notes>`
  // and emits these three fields per admin transition. The previous schema
  // also had `admin_id` / `admin_id_truncated` but the parser never
  // populated them (the source `message_reports.details` blob has no
  // author info), so the JSX always fell back to the literal "admin" —
  // misleading attribution. Removed to align types with reality.
  notes?: string | null
  status?: string | null
  at?: string | null
}

interface ReportAdminItem {
  id: string
  message_id: string
  reporter_id: string
  reporter_id_truncated: string
  reason: ReportReason | string
  severity: number
  status: ReportStatus | string
  created_at: string
  triaged_at: string | null
  // Free-text context written by the reporting student at filing time.
  // Surfaced separately from admin notes so the UI does not mis-attribute
  // the student's words as a moderator note.
  reporter_context?: string | null
  // Chronological notes added by admins on each status transition.
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
  hallucination: 'Alucinación',
  harmful: 'Contenido dañino',
  privacy: 'Privacidad',
  low_empathy: 'Baja empatía',
  other: 'Otro',
}

const REASON_CHIP_STYLES: Record<string, React.CSSProperties> = {
  hallucination: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  harmful: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  privacy: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37, 99, 235, 0.25)' },
  low_empathy: { background: 'var(--mabel-50)', color: 'var(--mabel-700)', borderColor: 'var(--mabel-200)' },
  other: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  triaged: 'Triado',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
}

const STATUS_CHIP_STYLES: Record<string, React.CSSProperties> = {
  open: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  triaged: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  resolved: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  dismissed: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
}

const SEVERITY_BADGE_STYLES: Record<number, React.CSSProperties> = {
  1: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  2: { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37, 99, 235, 0.25)' },
  3: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  4: { background: 'rgba(234, 88, 12, 0.10)', color: '#C2410C', borderColor: 'rgba(234, 88, 12, 0.30)' },
  5: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
}

// Mirror of backend `_ALLOWED_TRANSITIONS` in `reports_service.py`. Keep in
// sync: backend rejects any out-of-machine transition with HTTP 409.
// Rationale for `open → dismissed`: trivial reports (spam, duplicates,
// false positives) can be closed without an explicit triage step.
// Resolving still requires prior triage because it implies corrective
// action was taken.
const TRANSITIONS: Record<string, ReportStatus[]> = {
  open: ['triaged', 'dismissed'],
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

// Contextual placeholders for the notes textarea. They guide the admin to
// write the right kind of note for each transition: triage = initial
// assessment, resolved = corrective action, dismissed = reason for closing
// without action, reopen = justification for reverting the decision.
const NOTE_PLACEHOLDERS: Record<ReportStatus, string> = {
  triaged:
    'Resumen del triaje: ¿qué motiva el reporte? ¿severidad confirmada? ¿requiere acción correctiva o es falso positivo?',
  resolved:
    'Resolución: ¿qué acción se tomó (ajuste de prompt, actualización de guardrails, comunicación al usuario)? Adjunta enlaces o IDs si aplica.',
  dismissed:
    'Motivo del descarte: ¿por qué no procede (duplicado, fuera de alcance, sin evidencia suficiente, comportamiento esperado)?',
  open: 'Justificación para reabrir el reporte: nueva evidencia o aspecto no contemplado en la decisión previa.',
}

const NOTE_HELPER: Record<ReportStatus, string> = {
  triaged: 'Estas notas quedan en el historial del reporte (auditoría).',
  resolved: 'Estas notas se registran como cierre formal del reporte.',
  dismissed: 'Estas notas explican por qué el reporte no avanza.',
  open: 'Estas notas explican por qué el reporte vuelve a abrirse.',
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

function chipBaseStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    padding: '2px 9px',
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    ...extra,
  }
}

function ReasonChip({ reason }: { reason: string }) {
  const label = REASON_LABELS[reason] ?? reason
  const style = REASON_CHIP_STYLES[reason] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-600)',
    borderColor: 'var(--ink-200)',
  }
  return (
    <span className="inline-flex items-center" style={chipBaseStyle(style)}>
      {label}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const style = STATUS_CHIP_STYLES[status] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-600)',
    borderColor: 'var(--ink-200)',
  }
  return (
    <span className="inline-flex items-center" style={chipBaseStyle(style)}>
      {label}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: number }) {
  const style = SEVERITY_BADGE_STYLES[severity] ?? {
    background: 'var(--ink-100)',
    color: 'var(--ink-600)',
    borderColor: 'var(--ink-200)',
  }
  const long =
    severity >= 1 && severity <= 5
      ? severityLong(severity as 1 | 2 | 3 | 4 | 5)
      : `Severidad ${severity}`
  return (
    <span
      aria-label={long}
      title={long}
      className="inline-flex items-center justify-center"
      style={{
        minWidth: 28,
        height: 22,
        padding: '0 6px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        border: '1px solid',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
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
          ? 'Transición de estado no permitida.'
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
            Notas para "{ACTION_LABELS[selectedTarget]}" (opcional)
          </label>
          <textarea
            id={`notes-${reportId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={NOTE_PLACEHOLDERS[selectedTarget]}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
          />
          <p className="text-[11px] text-text-primary/50 italic">
            {NOTE_HELPER[selectedTarget]}
          </p>
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

      {/* Reporter context — what the student wrote when filing the report */}
      {row.reporter_context && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
            Contexto del reportante
          </p>
          <div className="bg-mabel-50 border border-mabel-200 rounded-md px-3 py-2 text-[12px]">
            <p className="text-text-primary whitespace-pre-wrap">
              {row.reporter_context}
            </p>
            <p className="text-[10px] text-text-primary/50 italic mt-1">
              Texto libre escrito por el estudiante al reportar el mensaje.
            </p>
          </div>
        </div>
      )}

      {/* Admin notes history — only admin-authored entries from transitions */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          Historial de notas del admin
        </p>
        {history.length === 0 ? (
          <p className="text-[12px] text-text-primary/50 italic">
            Aún no hay notas del admin registradas para este reporte.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((entry, i) => (
              <li
                key={i}
                className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[12px]"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-text-primary/70">
                    {entry.status
                      ? STATUS_LABELS[entry.status] ?? entry.status
                      : 'Nota'}
                  </span>
                  <span className="text-text-primary/50 tabular-nums text-[11px]">
                    {entry.at ? formatDateTime(entry.at) : '—'}
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
        Por privacidad, el contenido del mensaje reportado no se muestra al administrador. D-03 preservado.
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
        accessor: (row) =>
          row.reporter_id ? (
            <Link
              to={`/admin/users/${row.reporter_id}`}
              onClick={(e) => e.stopPropagation()}
              title={`Ver detalle del estudiante ${row.reporter_id_truncated}`}
              className="font-mono text-[11px] tracking-tight text-primary hover:underline focus:outline-none focus:underline"
            >
              {row.reporter_id_truncated || '—'}
            </Link>
          ) : (
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
            Moderación
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
            Reportes
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ink-500)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Triaje y resolución de reportes de estudiantes sobre respuestas de Mabel IA.
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
            <option value="hallucination">Alucinación</option>
            <option value="harmful">Contenido dañino</option>
            <option value="privacy">Privacidad</option>
            <option value="low_empathy">Baja empatía</option>
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
            <option value="1">1 — {SEVERITY_LABELS[1].toLowerCase()}</option>
            <option value="2">2 — {SEVERITY_LABELS[2].toLowerCase()}</option>
            <option value="3">3 — {SEVERITY_LABELS[3].toLowerCase()}</option>
            <option value="4">4 — {SEVERITY_LABELS[4].toLowerCase()}</option>
            <option value="5">5 — {SEVERITY_LABELS[5].toLowerCase()}</option>
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
            onClick={fetchReports}
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
            : 'No hay reportes registrados todavía.'
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
