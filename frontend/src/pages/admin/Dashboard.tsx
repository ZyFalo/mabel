import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import InfoHint from '../../components/admin/InfoHint'
import MetricCard from '../../components/admin/MetricCard'
import BarChartWrapper from '../../components/admin/charts/BarChartWrapper'
import DonutChartWrapper from '../../components/admin/charts/DonutChartWrapper'
import LineChartWrapper from '../../components/admin/charts/LineChartWrapper'
import MetricLineWithReference from '../../components/admin/charts/MetricLineWithReference'
import { CHART_COLORS } from '../../components/admin/charts/chartTheme'
import LlmStatusChip from '../../components/chat/LlmStatusChip'
import useLlmPrewarm from '../../hooks/useLlmPrewarm'

const POLL_INTERVAL_MS = 30000

interface DashboardKpis {
  total_users: number
  users_new_this_week: number
  sessions_today: number
  safety_events_24h: number
  reports_pending: number
  latency_avg_ms: number | null
  sus_avg: number | null
  // KPI nuevo 2026-05-23 (mig 011): rating de corazones promedio en
  // los últimos 30d. null cuando nadie ha calificado todavía.
  rating_avg_30d?: number | null
  rating_count_30d?: number
}

interface SeriesPoint {
  date: string
  value: number
}

interface MoodDistributionPoint {
  bucket: string // "0-3" | "4-6" | "7-10"
  count: number
}

// Backend may return either an array or el objeto de 5 buckets de
// caritas (2026-05-23). Mantenemos compat con el shape antiguo
// {bajo, medio, alto} para responder a backends viejos durante
// hot-reload, pero el shape primario actual es {muy_mal, mal,
// neutral, bien, excelente}.
type MoodDistribution =
  | MoodDistributionPoint[]
  | { bajo?: number; medio?: number; alto?: number }
  | {
      muy_mal?: number
      mal?: number
      neutral?: number
      bien?: number
      excelente?: number
    }

interface SafetyTypePoint {
  event_type?: string
  type?: string
  count: number
}

interface GuardrailsPoint {
  date: string
  count: number
}

interface SafetyEventMini {
  id: string
  created_at: string
  event_type: string
  severity: string | number | null
  status: string
  user_id_truncated?: string | null
  session_id_truncated?: string | null
}

/**
 * Session-grouped projection of the recent safety events array. Used by the
 * "Últimas 5 sesiones con safety events" widget on the dashboard so the
 * reviewer sees triage-friendly units (one row per chat) instead of a flat
 * event list with built-in duplication (risk_detected + redirect_shown
 * paired for every detection).
 */
interface SafetyEventSessionGroup {
  sessionIdTruncated: string
  events: SafetyEventMini[]
  maxSeverity: number
  eventCount: number
  latestAt: string
  overallStatus: 'active' | 'reviewed' | 'resolved'
}

function groupRecentEventsBySession(
  events: SafetyEventMini[],
  topN: number,
): SafetyEventSessionGroup[] {
  const map = new Map<string, SafetyEventMini[]>()
  for (const ev of events) {
    const key = ev.session_id_truncated ?? '(sin sesión)'
    const list = map.get(key)
    if (list) {
      list.push(ev)
    } else {
      map.set(key, [ev])
    }
  }
  const groups: SafetyEventSessionGroup[] = []
  for (const [key, evts] of map.entries()) {
    const sorted = [...evts].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const severities = sorted.map((e) => {
      const s = typeof e.severity === 'number' ? e.severity : Number(e.severity)
      return Number.isFinite(s) ? s : 0
    })
    const maxSeverity = severities.reduce((m, s) => Math.max(m, s), 0)
    const anyActive = sorted.some((e) => e.status === 'active')
    const anyReviewed = sorted.some((e) => e.status === 'reviewed')
    const overallStatus: SafetyEventSessionGroup['overallStatus'] = anyActive
      ? 'active'
      : anyReviewed
        ? 'reviewed'
        : 'resolved'
    groups.push({
      sessionIdTruncated: key,
      events: sorted,
      maxSeverity,
      eventCount: sorted.length,
      latestAt: sorted[0].created_at,
      overallStatus,
    })
  }
  return groups
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, topN)
}

interface DashboardResponse {
  // KPIs (flat or nested under "kpis"; we accept both)
  kpis?: DashboardKpis
  total_users?: number
  users_new_this_week?: number
  sessions_today?: number
  safety_events_24h?: number
  reports_pending?: number
  latency_avg_ms?: number | null
  sus_avg?: number | null
  // KPI nuevo 2026-05-23 (mig 011) — rating de corazones promedio
  // de los ultimos 30d. null si nadie ha calificado.
  rating_avg_30d?: number | null
  rating_count_30d?: number
  // Series
  sessions_per_day_30d?: SeriesPoint[]
  sessions_per_day?: SeriesPoint[]
  mood_distribution_30d?: MoodDistribution
  latency_per_day_30d?: SeriesPoint[]
  latency_per_day?: SeriesPoint[]
  safety_events_by_type_30d?: SafetyTypePoint[]
  guardrails_activations_14d?: GuardrailsPoint[]
  last_5_safety_events?: SafetyEventMini[]
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function latencyThreshold(ms: number | null | undefined): 'green' | 'yellow' | 'red' | undefined {
  if (ms == null) return undefined
  if (ms <= 20000) return 'green'
  if (ms <= 30000) return 'yellow'
  return 'red'
}

function susThreshold(value: number | null | undefined): 'green' | 'red' | undefined {
  if (value == null) return undefined
  return value >= 70 ? 'green' : 'red'
}

function pickKpis(d: DashboardResponse): DashboardKpis {
  if (d.kpis) return d.kpis
  return {
    total_users: d.total_users ?? 0,
    users_new_this_week: d.users_new_this_week ?? 0,
    sessions_today: d.sessions_today ?? 0,
    safety_events_24h: d.safety_events_24h ?? 0,
    reports_pending: d.reports_pending ?? 0,
    latency_avg_ms: d.latency_avg_ms ?? null,
    sus_avg: d.sus_avg ?? null,
    rating_avg_30d: d.rating_avg_30d ?? null,
    rating_count_30d: d.rating_count_30d ?? 0,
  }
}

// Severity chips — keys are the numeric severity from the backend
// (computed by guardrails_service: 1-5 scale). Severity 5 is solid red
// + white text + bold so it can't be mistaken for the lighter "Activo"
// status pill in the next column. Mirrors the SafetyEvents page convention.
const SEVERITY_CHIP: Record<string, React.CSSProperties> = {
  '1': { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  '2': { background: 'var(--info-50)', color: 'var(--info-600)', borderColor: 'rgba(37, 99, 235, 0.25)' },
  '3': { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  '4': { background: 'rgba(234, 88, 12, 0.10)', color: '#C2410C', borderColor: 'rgba(234, 88, 12, 0.30)' },
  '5': {
    background: 'var(--danger-700)',
    color: '#fff',
    borderColor: 'var(--danger-700)',
    fontWeight: 800,
  },
}

const STATUS_CHIP: Record<string, React.CSSProperties> = {
  active: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  reviewed: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  resolved: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  // Legacy keys kept for backward-compat with older event statuses
  open: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  reviewing: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  triaged: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  closed: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
  dismissed: { background: 'var(--ink-100)', color: 'var(--ink-600)', borderColor: 'var(--ink-200)' },
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  crisis: 'Crisis',
  suicide_risk: 'Riesgo suicidio',
  self_harm: 'Autolesión',
  violence: 'Violencia',
  abuse: 'Abuso',
  guardrail_violation: 'Guardrails',
  other: 'Otro',
}

function Chip({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '2px 9px',
        borderRadius: 9999,
        fontSize: 10.5,
        fontWeight: 600,
        border: '1px solid var(--ink-200)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  )
}

export default function Dashboard() {
  // Live status del LLM (GAP-3 review 2026-05-26). Polling cada 30 s
  // para que el admin vea en el header del dashboard si Mabel está
  // warm/cold/down sin tener que ir a /admin/config y hacer "Probar
  // conexión" manual. La lógica es provider-aware: si el admin
  // switcheó a Gemini, el chip refleja el estado real de Gemini.
  const llm = useLlmPrewarm({ pollIntervalMs: 30000 })

  const navigate = useNavigate()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await apiClient.get<DashboardResponse>('/admin/dashboard')
      setData(res.data)
      setLastUpdated(new Date())
      setErrorMsg(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el dashboard.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const id = window.setInterval(() => {
      fetchDashboard(true)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [fetchDashboard])

  const kpis = useMemo(() => (data ? pickKpis(data) : null), [data])

  const sessionsSeries = useMemo(
    () => data?.sessions_per_day_30d ?? data?.sessions_per_day ?? [],
    [data],
  )
  const latencySeries = useMemo(
    () => data?.latency_per_day_30d ?? data?.latency_per_day ?? [],
    [data],
  )

  // Distribucion del animo agrupada por las 5 caritas del formulario
  // actual (2026-05-23). Si el backend devuelve el shape antiguo
  // (bajo/medio/alto) lo expandimos lo mejor posible al de 5 buckets
  // — durante hot-reload puede coexistir y no queremos romper el
  // render.
  const moodData = useMemo(() => {
    const raw = data?.mood_distribution_30d
    if (!raw) return []

    // Definicion ordenada de las 5 caritas para que el bar chart las
    // rendera en orden semantico (peor → mejor) y no alfabetico.
    const buckets: Array<{ key: string; label: string }> = [
      { key: 'muy_mal', label: 'Muy mal' },
      { key: 'mal', label: 'Mal' },
      { key: 'neutral', label: 'Neutral' },
      { key: 'bien', label: 'Bien' },
      { key: 'excelente', label: 'Excelente' },
    ]

    if (Array.isArray(raw)) {
      // Si viene como array [{bucket, count}], asumimos que las keys
      // ya son las nuevas o legacy y mapeamos al label correspondiente.
      const lookup: Record<string, string> = {
        muy_mal: 'Muy mal',
        mal: 'Mal',
        neutral: 'Neutral',
        bien: 'Bien',
        excelente: 'Excelente',
        bajo: 'Mal',
        medio: 'Neutral',
        alto: 'Bien',
        '0-3': 'Mal',
        '4-6': 'Neutral',
        '7-10': 'Bien',
      }
      return raw.map((b) => ({
        bucket: lookup[b.bucket] ?? b.bucket,
        count: b.count,
      }))
    }

    // Shape objeto. Soporta tanto el nuevo (muy_mal/mal/...) como el
    // legacy (bajo/medio/alto) durante la transicion.
    const obj = raw as Record<string, number | undefined>
    if ('muy_mal' in obj || 'excelente' in obj) {
      return buckets.map((b) => ({
        bucket: b.label,
        count: obj[b.key] ?? 0,
      }))
    }
    // Fallback legacy: mapeamos al subset que aplica.
    return [
      { bucket: 'Mal', count: obj.bajo ?? 0 },
      { bucket: 'Neutral', count: obj.medio ?? 0 },
      { bucket: 'Bien', count: obj.alto ?? 0 },
    ]
  }, [data])

  const guardrailsData = useMemo(
    () =>
      (data?.guardrails_activations_14d ?? []).map((p) => ({
        date: p.date,
        count: p.count,
      })),
    [data],
  )

  const safetyByType = useMemo(() => {
    const items = data?.safety_events_by_type_30d ?? []
    return items.map((t) => {
      const key = t.event_type ?? t.type ?? ''
      return {
        name: EVENT_TYPE_LABEL[key] ?? key,
        value: t.count,
      }
    })
  }, [data])

  const safetyTotal = safetyByType.reduce((acc, d) => acc + d.value, 0)

  const lastEvents = data?.last_5_safety_events ?? []
  // Group the recent flat events into sessions so the widget reflects
  // distinct incidents rather than the noisy 1:1 pre/post-filter pair.
  const recentSessions = useMemo(
    () => groupRecentEventsBySession(lastEvents, 5),
    [lastEvents],
  )

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
      {/* Editorial header */}
      <header
        className="flex items-end justify-between flex-wrap"
        style={{ gap: 16, marginBottom: 28 }}
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
            Panel ejecutivo
          </p>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: 'var(--ink-900)',
              marginTop: 6,
              marginBottom: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}
          >
            Dashboard
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ink-500)',
              marginTop: 6,
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Indicadores en tiempo real del piloto Mabel IA en la UMB.
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 12 }}>
          {/* Chip live del estado del LLM activo. Visible siempre — el
              admin necesita ver el motor warm/cold/down como
              indicador operacional permanente. Distinto del student
              donde solo muestra warnings. */}
          <LlmStatusChip status={llm.status} provider={llm.provider} />
          {lastUpdated && (
            <p
              style={{
                fontSize: 11.5,
                color: 'var(--ink-400)',
                margin: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Actualizado{' '}
              {lastUpdated.toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
          )}
          <button
            type="button"
            onClick={() => fetchDashboard()}
            className="inline-flex items-center"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 9999,
              fontSize: 12.5,
              fontWeight: 600,
              background: 'var(--white)',
              border: '1px solid var(--ink-200)',
              color: 'var(--ink-700)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-50)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--mabel-200)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--white)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-700)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-200)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2.5 8a5.5 5.5 0 0 1 9.6-3.6M13.5 8a5.5 5.5 0 0 1-9.6 3.6M12 2v3h-3M4 14v-3h3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Actualizar
          </button>
        </div>
      </header>

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
            onClick={() => fetchDashboard()}
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

      {/* KPI grid — 7 cards in a fluid 2 / 3 / 4 grid */}
      <section
        aria-label="Indicadores clave"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
        style={{ gap: 12, marginBottom: 28 }}
      >
        <MetricCard
          label="Total usuarios"
          value={loading && !kpis ? '—' : (kpis?.total_users ?? 0).toLocaleString('es-CO')}
          badge={
            kpis && kpis.users_new_this_week > 0
              ? `+${kpis.users_new_this_week} esta semana`
              : undefined
          }
          hint="Registrados en la plataforma"
          info="Total acumulado de usuarios con cuenta en Mabel IA. Incluye estudiantes activos y admins. No descuenta usuarios eliminados (hard DELETE)."
        />
        <MetricCard
          label="Sesiones hoy"
          value={loading && !kpis ? '—' : (kpis?.sessions_today ?? 0).toLocaleString('es-CO')}
          hint="Iniciadas en la fecha actual"
          info="Cuántas sesiones se iniciaron desde las 00:00 de hoy (zona local del servidor)."
        />
        <MetricCard
          label="Safety events 24h"
          value={loading && !kpis ? '—' : (kpis?.safety_events_24h ?? 0).toLocaleString('es-CO')}
          threshold={kpis && kpis.safety_events_24h > 0 ? 'red' : 'green'}
          hint="Toca para ver detalle"
          onClick={() => navigate('/admin/safety-events')}
          info="Total de eventos de seguridad (risk_detected, redirect_shown, user_report) registrados en las últimas 24 horas. Clic para ir al detalle."
        />
        <MetricCard
          label="Reportes pendientes"
          value={loading && !kpis ? '—' : (kpis?.reports_pending ?? 0).toLocaleString('es-CO')}
          threshold={kpis && kpis.reports_pending > 0 ? 'red' : 'green'}
          hint="Triaje en cola"
          onClick={() => navigate('/admin/reports')}
          info="Reportes en estado 'open' que aún no han sido triados por ningún admin. Clic para abrir el triaje."
        />
        <MetricCard
          label="Latencia promedio"
          value={
            kpis?.latency_avg_ms == null
              ? '—'
              : `${(kpis.latency_avg_ms / 1000).toFixed(1)} s`
          }
          threshold={latencyThreshold(kpis?.latency_avg_ms)}
          hint="Objetivo: <= 20 s"
          info="Media simple de latency_ms para mensajes del asistente en el rango. El umbral 20 s es el criterio operativo del estudio. Para detalle por percentiles ver Métricas → Técnicas."
        />
        <MetricCard
          label="SUS promedio"
          value={kpis?.sus_avg == null ? '—' : kpis.sus_avg.toFixed(1)}
          threshold={susThreshold(kpis?.sus_avg)}
          hint="Objetivo: >= 70"
          info="System Usability Scale agregada de todas las respuestas SUS. 70 es 'aceptable' en la literatura; 80+ es 'bueno'. Vacío hasta que se ingesten respuestas del piloto."
        />
        <MetricCard
          label="Calificación promedio"
          value={
            kpis?.rating_avg_30d == null
              ? '—'
              : `${kpis.rating_avg_30d.toFixed(2)} / 5`
          }
          hint={
            kpis?.rating_count_30d && kpis.rating_count_30d > 0
              ? `${kpis.rating_count_30d} corazones en 30 d`
              : 'Sin calificaciones todavía'
          }
          info="Promedio de las calificaciones de corazones (1-5, más es mejor) que los estudiantes asignaron a sus conversaciones en los últimos 30 días. Es el indicador de satisfacción más directo desde el lado del usuario."
        />
        <MetricCard
          label="Nuevos esta semana"
          value={loading && !kpis ? '—' : (kpis?.users_new_this_week ?? 0).toLocaleString('es-CO')}
          hint="Altas en los últimos 7 días"
          info="Usuarios con created_at dentro de la última semana (7 días rolling). Indica el ritmo de adopción."
        />
      </section>

      {/* Charts grid 2x2 */}
      <section
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: 16, marginBottom: 16 }}
      >
        <ChartCard
          title="Sesiones por día"
          subtitle="Últimos 30 días"
          info="Cuántas sesiones se iniciaron cada día en los últimos 30 días. Útil para detectar tendencias de adopción o caídas inusuales."
        >
          <LineChartWrapper
            data={sessionsSeries.map((p) => ({ date: p.date, sesiones: p.value }))}
            lines={[{ key: 'sesiones', label: 'Sesiones', color: CHART_COLORS.primary }]}
            yLabel="Sesiones"
            height={240}
          />
        </ChartCard>

        <ChartCard
          title="Distribución de ánimo"
          subtitle="Check-ins de los últimos 30 días · 5 caritas"
          info="Cuántos estudiantes reportaron cada uno de los 5 niveles de ánimo (Muy mal · Mal · Neutral · Bien · Excelente) en sus check-ins recientes. Permite ver si predomina malestar o bienestar agregado. Los datos legacy del slider 0-10 se agrupan en el bucket de carita más cercano."
        >
          <BarChartWrapper
            data={moodData}
            bars={[{ key: 'count', label: 'Estudiantes', color: CHART_COLORS.primary }]}
            xKey="bucket"
            yLabel="Estudiantes"
            height={240}
          />
        </ChartCard>

        <ChartCard
          title="Latencia por día"
          subtitle="Promedio en ms · umbral 20 s"
          info="Latencia promedio diaria de los mensajes del asistente. La línea roja punteada marca el umbral operativo de 20 s; cruces sostenidos pueden indicar degradación del LLM o del backend."
        >
          <MetricLineWithReference
            data={latencySeries.map((p) => ({ date: p.date, latencia: p.value }))}
            lines={[{ key: 'latencia', label: 'Latencia (ms)', color: CHART_COLORS.accent }]}
            reference={20000}
            referenceLabel="20 s"
            yLabel="ms"
            height={240}
            formatY={(v) => `${(v / 1000).toFixed(0)}s`}
          />
        </ChartCard>

        <ChartCard
          title="Activaciones de guardrails"
          subtitle="Últimos 14 días"
          info="Conteo diario de eventos risk_detected (palabra clave de riesgo encontrada en input/output). Picos sostenidos pueden indicar palabras clave demasiado amplias o cohorte en período de mayor estrés."
        >
          <BarChartWrapper
            data={guardrailsData}
            bars={[{ key: 'count', label: 'Activaciones', color: CHART_COLORS.warning }]}
            xKey="date"
            formatXAsDate
            yLabel="Activaciones"
            height={240}
          />
        </ChartCard>
      </section>

      {/* Donut + last events row */}
      <section
        className="grid grid-cols-1 lg:grid-cols-5"
        style={{ gap: 16 }}
      >
        <div className="lg:col-span-2">
          <ChartCard
            title="Safety events por tipo"
            subtitle={
              // Heads-up to the reviewer that each risk_detected naturally
              // pairs with a redirect_shown (the SOS panel that triggered
              // FROM it), so the bar ratio is structural, not statistical.
              'Últimos 30 días · cada risk_detected suele venir acompañado de su redirect_shown'
            }
            info="Distribución de los tipos de safety events en los últimos 30 días. risk_detected ≈ redirect_shown por diseño (cada detección dispara el panel SOS); user_report son reportes manuales del estudiante."
          >
            <DonutChartWrapper
              data={safetyByType}
              height={280}
              centerLabel={safetyTotal.toLocaleString('es-CO')}
              centerSubLabel="Eventos"
            />
          </ChartCard>
        </div>

        <div className="lg:col-span-3">
          <div
            style={{
              background: 'var(--white)',
              border: '1px solid var(--ink-200)',
              borderRadius: 'var(--r-lg)',
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--ink-100)',
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    color: 'var(--mabel-700)',
                    opacity: 0.85,
                    margin: 0,
                  }}
                >
                  Vigilancia
                </p>
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--ink-900)',
                    marginTop: 4,
                    marginBottom: 0,
                  }}
                >
                  Últimas 5 sesiones con safety events
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/safety-events')}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--mabel-700)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.textDecoration = 'none'
                }}
              >
                Ver todos →
              </button>
            </div>
            {recentSessions.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--ink-400)',
                  fontStyle: 'italic',
                }}
              >
                Sin sesiones con eventos recientes
              </div>
            ) : (
              <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--ink-50)' }}>
                  <tr>
                    {['Último evento', 'Sesión', 'Severidad máx', 'Eventos', 'Estado'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: 'left',
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--ink-500)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--ink-200)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                    <th style={{ width: 48, borderBottom: '1px solid var(--ink-200)' }} />
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((s) => {
                    const sevLabel = s.maxSeverity > 0 ? String(s.maxSeverity) : '—'
                    const sevKey = String(s.maxSeverity)
                    const statusKey = String(s.overallStatus).toLowerCase()
                    return (
                      <tr
                        key={s.sessionIdTruncated}
                        onClick={() => navigate('/admin/safety-events')}
                        style={{
                          cursor: 'pointer',
                          transition: 'background var(--dur-fast) var(--ease-out)',
                        }}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLElement).style.background =
                            'rgba(244, 237, 236, 0.55)'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                        }}
                      >
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--ink-700)',
                            fontVariantNumeric: 'tabular-nums',
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          {formatDateTime(s.latestAt)}
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--ink-900)',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 12,
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          {s.sessionIdTruncated}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-100)' }}>
                          <Chip label={sevLabel} style={SEVERITY_CHIP[sevKey] ?? {}} />
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--ink-700)',
                            fontVariantNumeric: 'tabular-nums',
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          {s.eventCount}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-100)' }}>
                          <Chip label={s.overallStatus} style={STATUS_CHIP[statusKey]} />
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--ink-300)',
                            fontSize: 14,
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          ›
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  info,
  children,
}: {
  title: string
  subtitle?: string
  /** Optional contextual help surfaced as a hover tooltip next to the title. */
  info?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--white)',
        border: '1px solid var(--ink-200)',
        borderRadius: 'var(--r-lg)',
        padding: 18,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink-900)',
              margin: 0,
              letterSpacing: '-0.005em',
            }}
          >
            {title}
          </h3>
          {info && <InfoHint text={info} />}
        </div>
        {subtitle && (
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--ink-500)',
              marginTop: 3,
              marginBottom: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
