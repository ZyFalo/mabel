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

const SEVERITY_CHIP: Record<string, string> = {
  low: 'bg-success/10 text-success border-success/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  high: 'bg-danger/10 text-danger border-danger/30',
  critical: 'bg-danger/15 text-danger border-danger/40',
}

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-danger/10 text-danger border-danger/30',
  reviewing: 'bg-warning/10 text-warning border-warning/30',
  triaged: 'bg-warning/10 text-warning border-warning/30',
  resolved: 'bg-success/10 text-success border-success/30',
  closed: 'bg-gray-100 text-text-primary/60 border-gray-300',
  dismissed: 'bg-gray-100 text-text-primary/60 border-gray-300',
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  crisis: 'Crisis',
  suicide_risk: 'Riesgo suicidio',
  self_harm: 'Autolesion',
  violence: 'Violencia',
  abuse: 'Abuso',
  guardrail_violation: 'Guardrails',
  other: 'Otro',
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border tracking-wide',
        cls,
      ].join(' ')}
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
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Editorial header */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Panel ejecutivo
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">Dashboard</h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Indicadores en tiempo real del piloto Mabel IA en la UMB.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <p className="text-[11px] text-text-primary/50 tabular-nums">
              Actualizado {lastUpdated.toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
          )}
          <button
            type="button"
            onClick={() => fetchDashboard()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
          className="mb-4 border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => fetchDashboard()}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* KPI grid — 7 cards in a fluid 2 / 3 / 4 grid */}
      <section
        aria-label="Indicadores clave"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6"
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
          hint="Altas en los ultimos 7 dias"
        />
      </section>

      {/* Charts grid 2x2 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Sesiones por dia"
          subtitle="Ultimos 30 dias"
        >
          <LineChartWrapper
            data={sessionsSeries.map((p) => ({ date: p.date, sesiones: p.value }))}
            lines={[{ key: 'sesiones', label: 'Sesiones', color: CHART_COLORS.accent }]}
            yLabel="Sesiones"
            height={240}
          />
        </ChartCard>

        <ChartCard title="Distribucion de animo" subtitle="Check-ins de los ultimos 30 dias">
          <BarChartWrapper
            data={moodData}
            bars={[{ key: 'count', label: 'Estudiantes', color: CHART_COLORS.primary }]}
            xKey="bucket"
            yLabel="Estudiantes"
            height={240}
          />
        </ChartCard>

        <ChartCard title="Latencia por dia" subtitle="Promedio en ms — umbral 20 000 ms">
          <MetricLineWithReference
            data={latencySeries.map((p) => ({ date: p.date, latencia: p.value }))}
            lines={[{ key: 'latencia', label: 'Latencia (ms)', color: CHART_COLORS.violet }]}
            reference={20000}
            referenceLabel="20 s"
            yLabel="ms"
            height={240}
            formatY={(v) => `${(v / 1000).toFixed(0)}s`}
          />
        </ChartCard>

        <ChartCard title="Activaciones de guardrails" subtitle="Ultimos 14 dias">
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
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <ChartCard
            title="Safety events por tipo"
            subtitle="Distribucion de los ultimos 30 dias"
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
          <div className="bg-white border border-gray-200 rounded-lg h-full overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                  Vigilancia
                </p>
                <h3 className="text-sm font-semibold text-text-primary mt-0.5">
                  Ultimos 5 safety events
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/safety-events')}
                className="text-xs text-primary font-semibold hover:underline"
              >
                Ver todos
              </button>
            </div>
            {lastEvents.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-primary/40 italic">
                Sin eventos recientes
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50/70 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                      Fecha
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                      Tipo
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                      Severidad
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                      Estado
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {lastEvents.map((ev) => {
                    const sevKey = String(ev.severity).toLowerCase()
                    const statusKey = String(ev.status).toLowerCase()
                    return (
                      <tr
                        key={ev.id}
                        className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate('/admin/safety-events')}
                      >
                        <td className="px-4 py-2 align-middle text-text-primary/80 tabular-nums">
                          {formatDateTime(ev.created_at)}
                        </td>
                        <td className="px-4 py-2 align-middle text-text-primary/80">
                          {EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type}
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <Chip
                            label={String(ev.severity)}
                            cls={
                              SEVERITY_CHIP[sevKey] ??
                              'bg-gray-100 text-text-primary/70 border-gray-300'
                            }
                          />
                        </td>
                        <td className="px-4 py-2 align-middle">
                          <Chip
                            label={ev.status}
                            cls={
                              STATUS_CHIP[statusKey] ??
                              'bg-gray-100 text-text-primary/60 border-gray-300'
                            }
                          />
                        </td>
                        <td className="px-4 py-2 align-middle text-text-primary/40 text-xs">
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
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && (
          <p className="text-[11px] text-text-primary/50 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}
