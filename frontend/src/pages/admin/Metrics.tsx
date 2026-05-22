import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
import InfoHint from '../../components/admin/InfoHint'
import MetricCard from '../../components/admin/MetricCard'
import BarChartWrapper from '../../components/admin/charts/BarChartWrapper'
import DonutChartWrapper from '../../components/admin/charts/DonutChartWrapper'
import LineChartWrapper from '../../components/admin/charts/LineChartWrapper'
import MetricLineWithReference from '../../components/admin/charts/MetricLineWithReference'
import { CHART_COLORS } from '../../components/admin/charts/chartTheme'
import { useToastStore } from '../../stores/toastStore'

type TabKey = 'usage' | 'wellbeing' | 'technical' | 'safety' | 'study'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'usage', label: 'Uso' },
  { key: 'wellbeing', label: 'Bienestar' },
  { key: 'technical', label: 'Técnicas' },
  { key: 'safety', label: 'Seguridad' },
  { key: 'study', label: 'Estudio' },
]

function isTabKey(v: string | null): v is TabKey {
  return v === 'usage' || v === 'wellbeing' || v === 'technical' || v === 'safety' || v === 'study'
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  return { from: toISODate(from), to: toISODate(to) }
}

interface DateRange {
  from: string
  to: string
}

// ---------------- Shared Tab UI ----------------

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
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="mb-3">
        <div className="flex items-center" style={{ gap: 6 }}>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {info && <InfoHint text={info} />}
        </div>
        {subtitle && (
          <p className="text-[11px] text-text-primary/50 mt-0.5">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}

function useTabFetch<T>(
  endpoint: string,
  range: DateRange,
  refreshKey: number,
  cohort: string,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params: Record<string, string> = { from: range.from, to: range.to }
    if (cohort.trim()) params.cohort = cohort.trim()
    apiClient
      .get<T>(endpoint, { params })
      .then((res) => {
        if (!cancelled) setData(res.data)
      })
      .catch((err) => {
        if (cancelled) return
        const e = err as { response?: { data?: { detail?: string } } }
        setError(e?.response?.data?.detail ?? 'No se pudo cargar la métrica.')
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [endpoint, range.from, range.to, refreshKey, cohort])

  return { data, loading, error }
}

function TabState({
  loading,
  error,
  empty,
}: {
  loading: boolean
  error: string | null
  empty?: boolean
}) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-sm text-text-primary/50">
        Cargando métricas...
      </div>
    )
  }
  if (error) {
    return (
      <div
        role="alert"
        className="border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger"
      >
        {error}
      </div>
    )
  }
  if (empty) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-10 text-center text-sm text-text-primary/40 italic">
        Sin datos suficientes en el rango seleccionado
      </div>
    )
  }
  return null
}

// ---------------- Tab A: Usage ----------------

interface UsageResponse {
  active_users_per_day: Array<{ date: string; count: number }>
  sessions_per_user_distribution: Array<{ bucket: string; count: number }>
  avg_messages_per_session: number | null
  avg_session_duration_minutes: number | null
}

function TabUsage({
  range,
  refreshKey,
  cohort,
}: {
  range: DateRange
  refreshKey: number
  cohort: string
}) {
  const { data, loading, error } = useTabFetch<UsageResponse>(
    '/admin/metrics/usage',
    range,
    refreshKey,
    cohort,
  )
  const empty =
    !data ||
    ((data.active_users_per_day?.length ?? 0) === 0 &&
      (data.sessions_per_user_distribution?.length ?? 0) === 0)

  const state = <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  if (loading || error || empty) return state

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="Mensajes por sesión"
          value={
            data!.avg_messages_per_session == null
              ? '—'
              : data!.avg_messages_per_session.toFixed(1)
          }
          hint="Promedio en el rango"
          info="Promedio de mensajes (usuario + asistente) por sesión en el rango seleccionado. Indica qué tan profundas son las conversaciones; valores muy bajos pueden indicar abandono temprano."
        />
        <MetricCard
          label="Duración promedio"
          value={
            data!.avg_session_duration_minutes == null
              ? '—'
              : `${data!.avg_session_duration_minutes.toFixed(1)} min`
          }
          hint="Tiempo promedio por sesión"
          info="Tiempo desde el inicio (started_at) hasta el cierre (ended_at) de cada sesión, promediado. Solo cuenta sesiones cerradas."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Usuarios activos por día"
          subtitle="Conteo único diario"
          info="Número de usuarios únicos con al menos una sesión iniciada cada día del rango. Mide adopción real, no impresiones."
        >
          <LineChartWrapper
            data={data!.active_users_per_day.map((p) => ({
              date: p.date,
              activos: p.count,
            }))}
            lines={[{ key: 'activos', label: 'Activos', color: CHART_COLORS.accent }]}
            yLabel="Usuarios"
            height={260}
          />
        </ChartCard>
        <ChartCard
          title="Distribución de sesiones por usuario"
          subtitle="Buckets de frecuencia"
          info="Cuántos usuarios caen en cada bucket de cantidad de sesiones (1-2, 3-5, 6-10, 10+). Permite distinguir usuarios puntuales vs recurrentes."
        >
          <BarChartWrapper
            data={data!.sessions_per_user_distribution.map((b) => ({
              bucket: b.bucket,
              count: b.count,
            }))}
            bars={[{ key: 'count', label: 'Usuarios', color: CHART_COLORS.primary }]}
            xKey="bucket"
            yLabel="Usuarios"
            height={260}
          />
        </ChartCard>
      </div>
    </div>
  )
}

// ---------------- Tab B: Wellbeing ----------------

interface WellbeingResponse {
  mood_per_day: Array<{ date: string; mean: number }>
  sleep_per_day: Array<{ date: string; mean: number }>
  focus_distribution_per_week: Array<{
    week: string
    focus_category: string
    count: number
  }>
  mood_summary: {
    mean: number | null
    median: number | null
    std: number | null
    ci95_low: number | null
    ci95_high: number | null
    min: number | null
    max: number | null
  } | null
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

function TabWellbeing({
  range,
  refreshKey,
  cohort,
}: {
  range: DateRange
  refreshKey: number
  cohort: string
}) {
  const { data, loading, error } = useTabFetch<WellbeingResponse>(
    '/admin/metrics/wellbeing',
    range,
    refreshKey,
    cohort,
  )
  // Rules of Hooks: every hook must run on every render in the SAME order.
  // Previously this component early-returned before calling useMemo, so the
  // hook count changed between renders (4 → 5+) and React threw "Rendered
  // more hooks than during the previous render." Fix: run every hook
  // unconditionally with safe defaults, then early-return AFTER.
  //
  // We render mood and sleep as TWO separate charts (not a merged dual-axis
  // chart) because their scales differ enough (mood 0–10 vs sleep 0–12 h,
  // and pilot data often shows sleep < 1 h) that mixing them in one chart
  // pins the sleep line to the X axis and the user thinks it's missing.
  const moodSeries = useMemo(
    () => (data?.mood_per_day ?? []).map((p) => ({ date: p.date, mood: p.mean })),
    [data],
  )
  const sleepSeries = useMemo(
    () => (data?.sleep_per_day ?? []).map((p) => ({ date: p.date, sueno: p.mean })),
    [data],
  )

  const focusData = useMemo(() => {
    // `byWeek` holds only the per-category COUNTS (numbers). The week
    // label is later attached when we build the `rows` array below.
    // Earlier this map was initialized with `{ week: 0 }` which then got
    // spread into the row AFTER `{ week }`, overwriting the real label
    // with `0` — that's why the BarChart X axis showed "0" instead of
    // the week date.
    const byWeek: Record<string, Record<string, number>> = {}
    const categories = new Set<string>()
    for (const row of data?.focus_distribution_per_week ?? []) {
      categories.add(row.focus_category)
      if (!byWeek[row.week]) byWeek[row.week] = {}
      byWeek[row.week][row.focus_category] =
        (byWeek[row.week][row.focus_category] ?? 0) + row.count
    }
    const cats = Array.from(categories)
    const rows = Object.entries(byWeek).map(([week, vals]) => ({
      ...vals,
      week,
    }))
    rows.sort((a, b) => a.week.localeCompare(b.week))
    return { rows, cats }
  }, [data])

  const empty =
    !data ||
    ((data.mood_per_day?.length ?? 0) === 0 && (data.sleep_per_day?.length ?? 0) === 0)
  if (loading || error || empty) {
    return <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  }

  const summary = data!.mood_summary

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-3">
          <ChartCard
            title="Ánimo por día"
            subtitle="Escala 0–10 · promedios diarios"
            info="Promedio diario del ánimo reportado por los estudiantes en el check-in (campo mood, escala 0-10). Mide la tendencia agregada del estado emocional en el rango."
          >
            <LineChartWrapper
              data={moodSeries}
              lines={[{ key: 'mood', label: 'Ánimo', color: CHART_COLORS.primary }]}
              yLabel="Ánimo"
              height={170}
            />
          </ChartCard>
          <ChartCard
            title="Horas de sueño por día"
            subtitle="Promedios diarios"
            info="Promedio diario de horas de sueño autorreportadas en el check-in (campo sleep). El sueño insuficiente correlaciona fuertemente con malestar emocional."
          >
            <LineChartWrapper
              data={sleepSeries}
              lines={[{ key: 'sueno', label: 'Sueño (h)', color: CHART_COLORS.cyan }]}
              yLabel="Horas"
              height={170}
            />
          </ChartCard>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center mb-3" style={{ gap: 6 }}>
            <h3 className="text-sm font-semibold text-text-primary">Resumen ánimo</h3>
            <InfoHint text="Estadística descriptiva del ánimo en el rango. IC 95% calculado con t-Student (df = n-1) — para muestras pequeñas del piloto refleja honestamente la incertidumbre. Valores fuera de [0, 10] indican que n es muy pequeño para estimar la media con precisión." />
          </div>
          {summary ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <SummaryRow label="Media" value={fmtNum(summary.mean)} />
              <SummaryRow label="Mediana" value={fmtNum(summary.median)} />
              <SummaryRow label="Desv. est." value={fmtNum(summary.std)} />
              <SummaryRow
                label="IC 95%"
                value={
                  summary.ci95_low == null || summary.ci95_high == null
                    ? '—'
                    : `${fmtNum(summary.ci95_low)} — ${fmtNum(summary.ci95_high)}`
                }
              />
              <SummaryRow label="Min" value={fmtNum(summary.min, 0)} />
              <SummaryRow label="Max" value={fmtNum(summary.max, 0)} />
            </dl>
          ) : (
            <p className="text-sm text-text-primary/40 italic">Sin datos suficientes</p>
          )}
        </div>
      </div>

      <ChartCard
        title="Foco de preocupación por semana"
        subtitle="Distribución apilada"
        info="Categorías de preocupación que reportaron los estudiantes en sus check-ins, agrupadas por semana ISO. Identifica qué temas predominan (académico, social, otro) y cómo cambian en el tiempo."
      >
        {focusData.rows.length === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-text-primary/40 italic">
            Sin datos suficientes
          </div>
        ) : (
          <BarChartWrapper
            data={focusData.rows}
            bars={focusData.cats.map((cat, idx) => ({
              key: cat,
              label: cat,
              stackId: 'focus',
              color: [
                CHART_COLORS.accent,
                CHART_COLORS.primary,
                CHART_COLORS.warning,
                CHART_COLORS.violet,
                CHART_COLORS.cyan,
                CHART_COLORS.success,
              ][idx % 6],
            }))}
            xKey="week"
            yLabel="Check-ins"
            height={260}
          />
        )}
      </ChartCard>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/50 self-center">
        {label}
      </dt>
      <dd className="text-text-primary tabular-nums">{value}</dd>
    </>
  )
}

// ---------------- Tab C: Technical ----------------

interface TechnicalResponse {
  latency_percentiles_per_day: Array<{
    date: string
    p50: number
    p95: number
    p99: number
  }>
  pct_turns_under_20s: number | null
  tokens_per_day: Array<{
    date: string
    prompt_tokens: number
    completion_tokens: number
  }>
  gemini_cost_estimate_usd: number | null
}

function TabTechnical({
  range,
  refreshKey,
  cohort,
}: {
  range: DateRange
  refreshKey: number
  cohort: string
}) {
  const { data, loading, error } = useTabFetch<TechnicalResponse>(
    '/admin/metrics/technical',
    range,
    refreshKey,
    cohort,
  )
  const empty =
    !data ||
    ((data.latency_percentiles_per_day?.length ?? 0) === 0 &&
      (data.tokens_per_day?.length ?? 0) === 0)
  const state = <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  if (loading || error || empty) return state

  const pctUnder20 = data!.pct_turns_under_20s
  const pctThreshold: 'green' | 'yellow' | 'red' | undefined =
    pctUnder20 == null
      ? undefined
      : pctUnder20 >= 90
        ? 'green'
        : pctUnder20 >= 75
          ? 'yellow'
          : 'red'

  // Tokens are persisted by the LLM adapter post-#4-fix. Until messages
  // start arriving with tokens_*, the per-day chart and cost estimate
  // would render as flat zero — misleading. Detect any non-zero usage in
  // the range and only surface those visuals when real data exists.
  const tokensHaveData = (data!.tokens_per_day ?? []).some(
    (p) => (p.prompt_tokens ?? 0) > 0 || (p.completion_tokens ?? 0) > 0,
  )
  const costHasData =
    tokensHaveData &&
    data!.gemini_cost_estimate_usd != null &&
    data!.gemini_cost_estimate_usd > 0

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid grid-cols-1 ${costHasData ? 'sm:grid-cols-2' : ''} gap-3`}>
        <MetricCard
          label="Turnos bajo 20 s"
          value={pctUnder20 == null ? '—' : `${pctUnder20.toFixed(1)} %`}
          threshold={pctThreshold}
          hint="Objetivo: >= 90 %"
          info="Porcentaje de respuestas del asistente cuya latencia total (envío→primer token) fue menor a 20 s. KPI del criterio de éxito: 90% bajo el umbral."
        />
        {costHasData && (
          <MetricCard
            label="Costo LLM estimado"
            info="Costo estimado en USD calculado a partir de los tokens prompt + completion persistidos en la BD, multiplicados por las tarifas vigentes del modelo. Solo aparece cuando hay tokens registrados; con tráfico de piloto los valores son centavos o fracciones de centavo."
            value={(() => {
              // Pilot traffic produces sub-cent totals (e.g. $0.0001 for a
              // single short reply). `.toFixed(2)` rounds those down to
              // "$0.00", which reads as "no cost recorded". Use a
              // resolution that always renders a non-zero figure.
              const v = data!.gemini_cost_estimate_usd!
              if (v < 0.005) return `US$ ${v.toFixed(4)}`
              if (v < 1) return `US$ ${v.toFixed(3)}`
              return `US$ ${v.toFixed(2)}`
            })()}
            hint="Suma del rango"
          />
        )}
      </div>

      <ChartCard
        title="Percentiles de latencia"
        subtitle={
          data!.latency_percentiles_per_day.length === 1
            ? 'P50 / P95 / P99 del día — umbral 20 000 ms'
            : 'P50 / P95 / P99 por día — umbral 20 000 ms'
        }
        info="P50 es la latencia mediana (50% de turnos están por debajo); P95/P99 representan los peores casos al 5% y 1%. El umbral 20 s define el objetivo operativo: si P95 lo cruza, hay degradación percibible por los estudiantes."
      >
        {data!.latency_percentiles_per_day.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-text-primary/40 italic">
            Sin mediciones de latencia en el rango.
          </div>
        ) : data!.latency_percentiles_per_day.length === 1 ? (
          // Recharts cannot draw a line with a single point. Render the
          // P50/P95/P99 values as inline metric tiles so the admin still
          // sees the data instead of an empty chart.
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
            {(() => {
              const row = data!.latency_percentiles_per_day[0]
              const tiles: Array<{
                label: string
                value: number
                color: string
              }> = [
                { label: 'P50', value: row.p50, color: CHART_COLORS.success },
                { label: 'P95', value: row.p95, color: CHART_COLORS.warning },
                { label: 'P99', value: row.p99, color: CHART_COLORS.danger },
              ]
              return tiles.map((t) => (
                <div
                  key={t.label}
                  className="rounded-md border border-gray-200 px-4 py-3"
                  style={{ background: '#FFFFFF' }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60">
                    {t.label}
                  </p>
                  <p
                    className="text-xl font-semibold tabular-nums mt-1"
                    style={{ color: t.color }}
                  >
                    {(t.value / 1000).toFixed(2)} s
                  </p>
                  <p className="text-[10px] text-text-primary/40 mt-1 tabular-nums">
                    {row.date}
                  </p>
                </div>
              ))
            })()}
          </div>
        ) : (
          <MetricLineWithReference
            data={data!.latency_percentiles_per_day.map((p) => ({
              date: p.date,
              p50: p.p50,
              p95: p.p95,
              p99: p.p99,
            }))}
            lines={[
              { key: 'p50', label: 'P50', color: CHART_COLORS.success },
              { key: 'p95', label: 'P95', color: CHART_COLORS.warning },
              { key: 'p99', label: 'P99', color: CHART_COLORS.danger },
            ]}
            reference={20000}
            referenceLabel="20 s"
            yLabel="ms"
            height={280}
            formatY={(v) => `${(v / 1000).toFixed(0)}s`}
          />
        )}
      </ChartCard>

      {/* Tokens chart — only shown when the LLM adapter actually persists
          token counts. Today (0/28 messages have tokens_*) the chart would
          be a flat zero line, which is misleading. We hide it until data
          exists; once the adapter starts persisting tokens this section
          re-appears automatically. */}
      {tokensHaveData && (
      <ChartCard
        title="Tokens consumidos por día"
        subtitle="Prompt + completion (apilado)"
        info="Tokens enviados (prompt) y devueltos (completion) por el LLM, sumados por día. Los prompt tokens incluyen el historial de la conversación; los completion tokens son la respuesta de Mabel. Base para estimar el costo."
      >
        <BarChartWrapper
          data={data!.tokens_per_day.map((p) => ({
            date: p.date,
            prompt: p.prompt_tokens,
            completion: p.completion_tokens,
          }))}
          bars={[
            {
              key: 'prompt',
              label: 'Prompt',
              stackId: 'tokens',
              color: CHART_COLORS.accent,
            },
            {
              key: 'completion',
              label: 'Completion',
              stackId: 'tokens',
              color: CHART_COLORS.primary,
            },
          ]}
          xKey="date"
          formatXAsDate
          yLabel="Tokens"
          height={260}
        />
      </ChartCard>
      )}
    </div>
  )
}

// ---------------- Tab D: Safety ----------------

interface SafetyResponse {
  safety_events_per_day: Array<{ date: string; count: number }>
  // Backend returns the field as `event_type` (matches the safety_events
  // column). Frontend used to read `g.type` which was undefined and made
  // the donut legend render every slice as "value, value, value".
  guardrails_type_distribution: Array<{ event_type: string; count: number }>
  infraction_rate: number | null
  top_keywords: Array<{
    keyword_anonymized: string
    count: number
    percentage: number
  }>
}

function TabSafety({
  range,
  refreshKey,
  cohort,
}: {
  range: DateRange
  refreshKey: number
  cohort: string
}) {
  const { data, loading, error } = useTabFetch<SafetyResponse>(
    '/admin/metrics/safety',
    range,
    refreshKey,
    cohort,
  )
  const empty =
    !data ||
    ((data.safety_events_per_day?.length ?? 0) === 0 &&
      (data.guardrails_type_distribution?.length ?? 0) === 0)
  const state = <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  if (loading || error || empty) return state

  const infraction = data!.infraction_rate
  const infractionThreshold: 'green' | 'yellow' | 'red' | undefined =
    infraction == null
      ? undefined
      : infraction <= 1
        ? 'green'
        : infraction <= 5
          ? 'yellow'
          : 'red'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="Tasa de infracciones"
          value={infraction == null ? '—' : `${infraction.toFixed(2)} %`}
          threshold={infractionThreshold}
          hint="Sobre el total de turnos"
          info="Eventos risk_detected dividido entre el total de turnos del asistente en el rango. Mide qué tan seguido se activan los guardrails de contenido; valores altos pueden indicar palabras clave demasiado amplias o usuarios en crisis."
        />
        <MetricCard
          label="Tipos de guardrails"
          value={(data!.guardrails_type_distribution ?? []).length.toString()}
          hint="Categorías activadas en el rango"
          info="Cuántas categorías distintas de safety_events ocurrieron en el rango (risk_detected, redirect_shown, user_report, etc.). La distribución se ve en el donut a la derecha."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ChartCard
            title="Safety events por día"
            subtitle="Conteo diario"
            info="Total de eventos de seguridad registrados cada día (risk_detected + redirect_shown + user_report). Picos pueden coincidir con períodos de mayor estrés académico."
          >
            <LineChartWrapper
              data={data!.safety_events_per_day.map((p) => ({
                date: p.date,
                eventos: p.count,
              }))}
              lines={[{ key: 'eventos', label: 'Eventos', color: CHART_COLORS.danger }]}
              yLabel="Eventos"
              height={280}
            />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <ChartCard
            title="Tipos de guardrails"
            subtitle="Distribución"
            info="Cómo se reparten los safety_events por tipo. risk_detected son detecciones por palabras clave; redirect_shown indica que se mostró el panel SOS; user_report son reportes manuales del estudiante."
          >
            <DonutChartWrapper
              data={data!.guardrails_type_distribution.map((g) => ({
                name: g.event_type,
                value: g.count,
              }))}
              height={280}
            />
          </ChartCard>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-text-primary">
            Top keywords (anonimizadas)
          </h3>
          <p className="text-[11px] text-text-primary/50 mt-0.5">
            Hashes truncados de las palabras mas activadas
          </p>
        </div>
        {data!.top_keywords.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-primary/40 italic">
            Sin keywords activadas en el rango
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 border-b border-gray-100">
              <tr>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                  Keyword (hash)
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                  Conteo
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-primary/60 px-4 py-2">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {data!.top_keywords.map((kw, idx) => (
                <tr key={kw.keyword_anonymized + idx} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-4 py-2 font-mono text-[12px] text-text-primary/80">
                    {kw.keyword_anonymized}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{kw.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {kw.percentage.toFixed(1)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------------- Tab E: Study ----------------

interface StudyComparison {
  group: string
  n_paired: number | null
  n_excluded: number | null
  mean_pre: number | null
  mean_post: number | null
  diff: number | null
  cohens_d: number | null
  p_value: number | null
  test_used: 'paired_t' | 'wilcoxon' | null
  shapiro_p: number | null
  test_skipped_reason: string | null
  // legacy fields (fallback)
  n?: number
}

interface StudyResponse {
  sus_distribution: Array<{ bucket: string; count: number }>
  sus_mean_vs_target: { mean: number | null; target: number }
  empathy_distribution: Array<{ score: number | string; count: number }>
  pct_empathy_4_or_above: number | null
  cohens_d_estimate: number | null
  wellbeing_pre_post_comparison: StudyComparison[]
}

function TabStudy({
  range,
  refreshKey,
  cohort,
}: {
  range: DateRange
  refreshKey: number
  cohort: string
}) {
  const { data, loading, error } = useTabFetch<StudyResponse>(
    '/admin/metrics/study',
    range,
    refreshKey,
    cohort,
  )

  // Estudio (cuasi-experimental) only makes sense scoped to a cohort —
  // mixing piloto students with admin/test accounts distorts SUS/empathy
  // averages and pre/post comparisons. We previously auto-set the cohort
  // here, but that surprised admins and bled the filter into other tabs.
  // Now we require the admin to set the cohort explicitly.
  if (!cohort.trim()) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center flex flex-col items-center gap-2">
        <p className="text-sm font-semibold text-text-primary">
          Selecciona una cohorte para ver los resultados del estudio.
        </p>
        <p className="text-[12px] text-text-primary/60 max-w-md">
          Las métricas del estudio cuasi-experimental (SUS, empatía,
          comparaciones pre/post) solo son representativas cuando se filtran
          por la cohorte participante. Usa el campo "Cohorte" en la barra
          superior (ej. <span className="font-mono">piloto-fase1</span>).
        </p>
      </div>
    )
  }

  const empty =
    !data ||
    ((data.sus_distribution?.length ?? 0) === 0 &&
      (data.empathy_distribution?.length ?? 0) === 0)
  const state = <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  if (loading || error || empty) return state

  const susMean = data!.sus_mean_vs_target?.mean ?? null
  const susTarget = data!.sus_mean_vs_target?.target ?? 70
  const susThreshold: 'green' | 'red' | undefined =
    susMean == null ? undefined : susMean >= susTarget ? 'green' : 'red'

  const pctEmpathy = data!.pct_empathy_4_or_above
  const empathyThreshold: 'green' | 'yellow' | 'red' | undefined =
    pctEmpathy == null
      ? undefined
      : pctEmpathy >= 80
        ? 'green'
        : pctEmpathy >= 60
          ? 'yellow'
          : 'red'

  const comparisons = data!.wellbeing_pre_post_comparison ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="SUS promedio"
          value={susMean == null ? '—' : susMean.toFixed(1)}
          threshold={susThreshold}
          hint={`Objetivo: >= ${susTarget}`}
          info="System Usability Scale: instrumento estandarizado de 10 preguntas que mide la usabilidad percibida (escala 0-100). El umbral 70 es 'aceptable' en la literatura; 80+ es 'bueno'."
        />
        <MetricCard
          label="Empatía >= 4/5"
          value={pctEmpathy == null ? 'Sin datos suficientes' : `${pctEmpathy.toFixed(1)} %`}
          threshold={empathyThreshold}
          hint="Objetivo: >= 80 %"
          info="Porcentaje de respuestas de Mabel calificadas con 4 o 5 (de 5) por evaluadores entrenados según la rúbrica de empatía. Criterio de éxito del estudio: ≥ 80%."
        />
        <MetricCard
          label="Comparaciones pre/post"
          value={comparisons.length.toString()}
          hint="Variables emparejadas por usuario"
          info="Cuántas variables tienen mediciones pre y post para los mismos usuarios. Las comparaciones se hacen con t-test pareado (si los datos pasan Shapiro-Wilk) o Wilcoxon signed-rank si no."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Distribución SUS"
          subtitle="Por rangos de puntaje"
          info="Cuántas respuestas SUS cayeron en cada bucket de puntaje. Útil para distinguir si el promedio refleja consenso o una distribución bimodal (algunos usuarios contentos, otros no)."
        >
          <BarChartWrapper
            data={data!.sus_distribution.map((b) => ({ bucket: b.bucket, count: b.count }))}
            bars={[{ key: 'count', label: 'Respuestas', color: CHART_COLORS.accent }]}
            xKey="bucket"
            yLabel="Respuestas"
            height={260}
          />
        </ChartCard>
        <ChartCard
          title="Distribución de empatía"
          subtitle="Calificaciones 1-5"
          info="Conteo de calificaciones de empatía por nivel (1-5). 1 = sin empatía, 5 = altamente empática. Permite ver la masa de calificaciones bajas vs altas y si el promedio agregado oculta una cola problemática."
        >
          <BarChartWrapper
            data={data!.empathy_distribution.map((b) => ({
              score: String(b.score),
              count: b.count,
            }))}
            bars={[{ key: 'count', label: 'Calificaciones', color: CHART_COLORS.primary }]}
            xKey="score"
            yLabel="Calificaciones"
            height={260}
          />
        </ChartCard>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-text-primary">
            Comparacion bienestar pre / post
          </h3>
          <p className="text-[11px] text-text-primary/50 mt-0.5">
            Estadística inferencial con pares emparejados por usuario
          </p>
        </div>
        {comparisons.length === 0 ? (
          <p className="text-sm text-text-primary/40 italic py-6 text-center">
            Sin pares pre/post disponibles aun
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {comparisons.map((c) => (
              <ComparisonCard key={c.group} comparison={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Comparison card for Tab E ----

function fmt3(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(3)
}

function fmt2(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(2)
}

function testLabel(t: StudyComparison['test_used']): string {
  if (t === 'paired_t') return 'Paired t-test (paramétrico)'
  if (t === 'wilcoxon') return 'Wilcoxon signed-rank (no paramétrico)'
  return '—'
}

function cohensInterpretation(d: number): {
  label: string
  cls: string
} {
  const abs = Math.abs(d)
  if (abs < 0.2) return { label: 'chico', cls: 'bg-gray-100 text-text-primary/60 border-gray-300' }
  if (abs < 0.5)
    return { label: 'mediano', cls: 'bg-warning/10 text-warning border-warning/30' }
  return { label: 'grande', cls: 'bg-success/10 text-success border-success/30' }
}

function ComparisonCard({ comparison }: { comparison: StudyComparison }) {
  const c = comparison
  const nPaired = c.n_paired ?? c.n ?? null
  const nExcluded = c.n_excluded ?? 0
  const diff = c.diff
  const diffClass =
    diff == null || diff === 0
      ? 'text-text-primary'
      : diff > 0
        ? 'text-success'
        : 'text-danger'

  const cohensView = (() => {
    if (c.cohens_d == null) {
      return (
        <div>
          <p className="text-base font-semibold text-text-primary/50">No calculable</p>
          {c.test_skipped_reason && (
            <p className="text-[11px] text-text-primary/50 mt-1">{c.test_skipped_reason}</p>
          )}
        </div>
      )
    }
    const { label, cls } = cohensInterpretation(c.cohens_d)
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-2xl font-semibold tabular-nums text-text-primary leading-none">
          {c.cohens_d.toFixed(2)}
        </span>
        <span
          className={[
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border',
            cls,
          ].join(' ')}
        >
          {label}
        </span>
      </div>
    )
  })()

  const pView =
    c.test_skipped_reason || c.p_value == null ? (
      <span className="text-text-primary/50">—</span>
    ) : (
      <span
        className={[
          'tabular-nums font-semibold',
          c.p_value < 0.05 ? 'text-success' : 'text-text-primary/70',
        ].join(' ')}
      >
        {c.p_value < 0.001 ? '< 0.001' : fmt3(c.p_value)}
      </span>
    )

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="text-sm font-semibold text-text-primary capitalize">{c.group}</h4>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45">
            N
          </p>
          <p className="text-2xl font-semibold text-text-primary tabular-nums leading-none">
            {nPaired ?? '—'}
          </p>
          {nExcluded > 0 && (
            <p className="text-[11px] text-text-primary/45 mt-1">
              {nExcluded} excluido{nExcluded === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-gray-100 py-3 my-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45">
            Pre
          </p>
          <p className="text-base font-semibold tabular-nums text-text-primary">
            {fmt2(c.mean_pre)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45">
            Post
          </p>
          <p className="text-base font-semibold tabular-nums text-text-primary">
            {fmt2(c.mean_post)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45">
            Δ
          </p>
          <p className={['text-base font-semibold tabular-nums', diffClass].join(' ')}>
            {diff == null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
          </p>
        </div>
      </div>

      <div className="space-y-2.5 text-[12px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-primary/50">Test estadístico</span>
          <span className="text-text-primary font-medium text-right">
            {testLabel(c.test_used)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-primary/50">Shapiro-Wilk p</span>
          <span className="tabular-nums text-text-primary">{fmt3(c.shapiro_p)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-primary/50">p-value</span>
          {pView}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-1.5">
          Cohen's d
        </p>
        {cohensView}
      </div>
    </div>
  )
}

// ---------------- Metrics root component ----------------

export default function Metrics() {
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = searchParams.get('tab')
  const activeTab: TabKey = isTabKey(initialTab) ? initialTab : 'usage'

  const initialFrom = searchParams.get('from')
  const initialTo = searchParams.get('to')
  const fallback = useMemo(() => defaultRange(), [])
  const [range, setRange] = useState<DateRange>({
    from: initialFrom || fallback.from,
    to: initialTo || fallback.to,
  })
  const [draft, setDraft] = useState<DateRange>(range)
  const [refreshKey, setRefreshKey] = useState(0)

  const cohortParam = searchParams.get('cohort') ?? ''

  // Distinct cohorts loaded once from /admin/users/cohorts. The select
  // shows "Todas" (no filter) + every value found in DB. We load lazily
  // and merge `cohortParam` into the list if it doesn't appear, so a
  // bookmark with an old cohort still renders correctly.
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
    if (cohortParam) set.add(cohortParam)
    return Array.from(set).sort()
  }, [cohorts, cohortParam])

  // Keep ?tab in sync if missing/invalid
  useEffect(() => {
    if (!isTabKey(initialTab)) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // NOTE: previously this useEffect auto-set `cohort=piloto-fase1` when the
  // admin entered the Estudio tab. Removed because (1) it was sticky across
  // tabs (silently filtered Uso/Bienestar/etc. after one visit to Estudio),
  // (2) the magic value was hardcoded, and (3) it surprised the admin.
  // The Estudio tab now relies on an explicit cohort input + empty state
  // when none is set.

  // Cohort changes are applied immediately on select change (no Apply
  // button). Pass empty string to clear the filter.
  function setCohort(next_cohort: string) {
    const next = new URLSearchParams(searchParams)
    if (next_cohort) next.set('cohort', next_cohort)
    else next.delete('cohort')
    setSearchParams(next)
  }

  // True when any filter differs from the defaults (default range = last 30
  // days, no cohort). Used to decide whether to surface "Limpiar filtros".
  const filtersDirty =
    cohortParam !== '' ||
    range.from !== fallback.from ||
    range.to !== fallback.to

  function clearAllFilters() {
    setRange(fallback)
    setDraft(fallback)
    const next = new URLSearchParams(searchParams)
    next.delete('cohort')
    next.delete('from')
    next.delete('to')
    setSearchParams(next)
  }

  const changeTab = useCallback(
    (tab: TabKey) => {
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  function applyRange() {
    if (!draft.from || !draft.to) {
      addToast({ type: 'error', message: 'Selecciona un rango de fechas válido.' })
      return
    }
    if (draft.from > draft.to) {
      addToast({ type: 'error', message: 'La fecha "desde" debe ser anterior a "hasta".' })
      return
    }
    setRange(draft)
    const next = new URLSearchParams(searchParams)
    next.set('from', draft.from)
    next.set('to', draft.to)
    setSearchParams(next)
  }

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

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
            Estudio cuasiexperimental
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
            Métricas
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ink-500)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Indicadores de uso, bienestar, técnicos, seguridad y estudio.
          </p>
        </div>
        <ExportCsvButton
          url="/admin/metrics/export.csv"
          params={{
            tab: activeTab,
            from: range.from,
            to: range.to,
            ...(cohortParam ? { cohort: cohortParam } : {}),
          }}
          filename={`metricas-${activeTab}-${range.from}_${range.to}${cohortParam ? `_${cohortParam}` : ''}.csv`}
          onError={(msg) => addToast({ type: 'error', message: msg })}
        />
      </header>

      {/* Toolbar */}
      <section
        aria-label="Controles globales"
        className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="metrics-from"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Desde
          </label>
          <input
            id="metrics-from"
            type="date"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="metrics-to"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Hasta
          </label>
          <input
            id="metrics-to"
            type="date"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={applyRange}
          className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90"
        >
          Aplicar
        </button>
        <button
          type="button"
          onClick={refresh}
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

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label
            htmlFor="metrics-cohort"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Cohorte
          </label>
          <select
            id="metrics-cohort"
            value={cohortParam}
            onChange={(e) => setCohort(e.target.value)}
            disabled={!cohortsLoaded}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[160px] disabled:opacity-60"
          >
            <option value="">Todas</option>
            {cohortOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {filtersDirty && (
          <button
            type="button"
            onClick={clearAllFilters}
            title="Restablecer rango a últimos 30 días y limpiar cohorte"
            className="self-end inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-danger border border-danger/30 hover:bg-danger/5"
          >
            Limpiar filtros
          </button>
        )}

        <div className="ml-auto text-[11px] text-text-primary/50 tabular-nums text-right">
          <div>
            Rango: <span className="font-medium text-text-primary/70">{range.from}</span> →{' '}
            <span className="font-medium text-text-primary/70">{range.to}</span>
          </div>
          {cohortParam && (
            <div className="mt-0.5">
              Cohorte:{' '}
              <span
                className="font-mono font-medium"
                style={{ color: 'var(--mabel-700)' }}
              >
                {cohortParam}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="Tabs de métricas"
        className="flex flex-wrap items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 w-fit"
      >
        {TABS.map((t) => {
          const active = t.key === activeTab
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => changeTab(t.key)}
              className={[
                'px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-primary/70 hover:bg-gray-100 hover:text-text-primary',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      {activeTab === 'usage' && (
        <TabUsage range={range} refreshKey={refreshKey} cohort={cohortParam} />
      )}
      {activeTab === 'wellbeing' && (
        <TabWellbeing range={range} refreshKey={refreshKey} cohort={cohortParam} />
      )}
      {activeTab === 'technical' && (
        <TabTechnical range={range} refreshKey={refreshKey} cohort={cohortParam} />
      )}
      {activeTab === 'safety' && (
        <TabSafety range={range} refreshKey={refreshKey} cohort={cohortParam} />
      )}
      {activeTab === 'study' && (
        <TabStudy range={range} refreshKey={refreshKey} cohort={cohortParam} />
      )}
    </div>
  )
}
