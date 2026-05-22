import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import MetricCard from '../../components/admin/MetricCard'
import BarChartWrapper from '../../components/admin/charts/BarChartWrapper'
import DonutChartWrapper from '../../components/admin/charts/DonutChartWrapper'
import LineChartWrapper from '../../components/admin/charts/LineChartWrapper'
import MetricLineWithReference from '../../components/admin/charts/MetricLineWithReference'
import { CHART_COLORS } from '../../components/admin/charts/chartTheme'

const POLL_INTERVAL_MS = 30000

interface DashboardKpis {
  total_users: number
  users_new_this_week: number
  sessions_today: number
  safety_events_24h: number
  reports_pending: number
  latency_avg_ms: number | null
  sus_avg: number | null
}

interface SeriesPoint {
  date: string
  value: number
}

interface MoodDistributionPoint {
  bucket: string // "0-3" | "4-6" | "7-10"
  count: number
}

// Backend may return either an array or {bajo, medio, alto} object
type MoodDistribution = MoodDistributionPoint[] | { bajo: number; medio: number; alto: number }

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
  severity: string | number
  status: string
  user_id_truncated?: string | null
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
  }
}

const SEVERITY_CHIP: Record<string, React.CSSProperties> = {
  low: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
  medium: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  high: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  critical: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
}

const STATUS_CHIP: Record<string, React.CSSProperties> = {
  open: { background: 'var(--danger-50)', color: 'var(--danger-700)', borderColor: 'var(--danger-200)' },
  reviewing: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  triaged: { background: 'var(--warn-50)', color: 'var(--warn-700)', borderColor: 'var(--warn-200)' },
  resolved: { background: 'var(--success-50)', color: 'var(--success-700)', borderColor: 'var(--success-200)' },
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

  const moodData = useMemo(() => {
    const raw = data?.mood_distribution_30d
    const labels: Record<string, string> = {
      '0-3': 'Bajo (0-3)',
      '4-6': 'Medio (4-6)',
      '7-10': 'Alto (7-10)',
      bajo: 'Bajo (0-3)',
      medio: 'Medio (4-6)',
      alto: 'Alto (7-10)',
    }
    if (!raw) return []
    // Backend may return either an array [{bucket, count}] or an object {bajo, medio, alto}
    if (Array.isArray(raw)) {
      return raw.map((b) => ({
        bucket: labels[b.bucket] ?? b.bucket,
        count: b.count,
      }))
    }
    return [
      { bucket: labels.bajo, count: raw.bajo ?? 0 },
      { bucket: labels.medio, count: raw.medio ?? 0 },
      { bucket: labels.alto, count: raw.alto ?? 0 },
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
        />
        <MetricCard
          label="Sesiones hoy"
          value={loading && !kpis ? '—' : (kpis?.sessions_today ?? 0).toLocaleString('es-CO')}
          hint="Iniciadas en la fecha actual"
        />
        <MetricCard
          label="Safety events 24h"
          value={loading && !kpis ? '—' : (kpis?.safety_events_24h ?? 0).toLocaleString('es-CO')}
          threshold={kpis && kpis.safety_events_24h > 0 ? 'red' : 'green'}
          hint="Toca para ver detalle"
          onClick={() => navigate('/admin/safety-events')}
        />
        <MetricCard
          label="Reportes pendientes"
          value={loading && !kpis ? '—' : (kpis?.reports_pending ?? 0).toLocaleString('es-CO')}
          threshold={kpis && kpis.reports_pending > 0 ? 'red' : 'green'}
          hint="Triaje en cola"
          onClick={() => navigate('/admin/reports')}
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
        />
        <MetricCard
          label="SUS promedio"
          value={kpis?.sus_avg == null ? '—' : kpis.sus_avg.toFixed(1)}
          threshold={susThreshold(kpis?.sus_avg)}
          hint="Objetivo: >= 70"
        />
        <MetricCard
          label="Nuevos esta semana"
          value={loading && !kpis ? '—' : (kpis?.users_new_this_week ?? 0).toLocaleString('es-CO')}
          hint="Altas en los últimos 7 días"
        />
      </section>

      {/* Charts grid 2x2 */}
      <section
        className="grid grid-cols-1 lg:grid-cols-2"
        style={{ gap: 16, marginBottom: 16 }}
      >
        <ChartCard title="Sesiones por día" subtitle="Últimos 30 días">
          <LineChartWrapper
            data={sessionsSeries.map((p) => ({ date: p.date, sesiones: p.value }))}
            lines={[{ key: 'sesiones', label: 'Sesiones', color: CHART_COLORS.primary }]}
            yLabel="Sesiones"
            height={240}
          />
        </ChartCard>

        <ChartCard title="Distribución de ánimo" subtitle="Check-ins de los últimos 30 días">
          <BarChartWrapper
            data={moodData}
            bars={[{ key: 'count', label: 'Estudiantes', color: CHART_COLORS.primary }]}
            xKey="bucket"
            yLabel="Estudiantes"
            height={240}
          />
        </ChartCard>

        <ChartCard title="Latencia por día" subtitle="Promedio en ms · umbral 20 s">
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

        <ChartCard title="Activaciones de guardrails" subtitle="Últimos 14 días">
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
            subtitle="Distribución de los últimos 30 días"
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
                  Últimos 5 safety events
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
            {lastEvents.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--ink-400)',
                  fontStyle: 'italic',
                }}
              >
                Sin eventos recientes
              </div>
            ) : (
              <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--ink-50)' }}>
                  <tr>
                    {['Fecha', 'Tipo', 'Severidad', 'Estado'].map((h) => (
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
                    ))}
                    <th style={{ width: 48, borderBottom: '1px solid var(--ink-200)' }} />
                  </tr>
                </thead>
                <tbody>
                  {lastEvents.map((ev) => {
                    const sevKey = String(ev.severity).toLowerCase()
                    const statusKey = String(ev.status).toLowerCase()
                    return (
                      <tr
                        key={ev.id}
                        onClick={() => navigate('/admin/safety-events')}
                        style={{ cursor: 'pointer', transition: 'background var(--dur-fast) var(--ease-out)' }}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLElement).style.background = 'rgba(244, 237, 236, 0.55)'
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
                          {formatDateTime(ev.created_at)}
                        </td>
                        <td
                          style={{
                            padding: '10px 16px',
                            color: 'var(--ink-900)',
                            borderBottom: '1px solid var(--ink-100)',
                          }}
                        >
                          {EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-100)' }}>
                          <Chip label={String(ev.severity)} style={SEVERITY_CHIP[sevKey]} />
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-100)' }}>
                          <Chip label={ev.status} style={STATUS_CHIP[statusKey]} />
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
  children,
}: {
  title: string
  subtitle?: string
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
