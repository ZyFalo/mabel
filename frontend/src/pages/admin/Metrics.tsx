import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import ExportCsvButton from '../../components/admin/ExportCsvButton'
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
  { key: 'technical', label: 'Tecnicas' },
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
        setError(e?.response?.data?.detail ?? 'No se pudo cargar la metrica.')
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
        Cargando metricas...
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
          label="Mensajes por sesion"
          value={
            data!.avg_messages_per_session == null
              ? '—'
              : data!.avg_messages_per_session.toFixed(1)
          }
          hint="Promedio en el rango"
        />
        <MetricCard
          label="Duracion promedio"
          value={
            data!.avg_session_duration_minutes == null
              ? '—'
              : `${data!.avg_session_duration_minutes.toFixed(1)} min`
          }
          hint="Tiempo promedio por sesion"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Usuarios activos por dia" subtitle="Conteo unico diario">
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
          title="Distribucion de sesiones por usuario"
          subtitle="Buckets de frecuencia"
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
  const empty =
    !data ||
    ((data.mood_per_day?.length ?? 0) === 0 && (data.sleep_per_day?.length ?? 0) === 0)
  const state = <TabState loading={loading} error={error} empty={!loading && !error && empty} />
  if (loading || error || empty) return state

  // Build a merged date axis for mood + sleep
  const moodSleepData = useMergedByDate(
    data!.mood_per_day.map((p) => ({ date: p.date, mood: p.mean })),
    data!.sleep_per_day.map((p) => ({ date: p.date, sueno: p.mean })),
  )

  // Build stacked bar focus distribution
  const focusData = useMemo(() => {
    const byWeek: Record<string, Record<string, number>> = {}
    const categories = new Set<string>()
    for (const row of data!.focus_distribution_per_week ?? []) {
      categories.add(row.focus_category)
      if (!byWeek[row.week]) byWeek[row.week] = { week: 0 } as unknown as Record<string, number>
      byWeek[row.week][row.focus_category] =
        (byWeek[row.week][row.focus_category] ?? 0) + row.count
    }
    const cats = Array.from(categories)
    const rows = Object.entries(byWeek).map(([week, vals]) => ({ week, ...vals }))
    rows.sort((a, b) => a.week.localeCompare(b.week))
    return { rows, cats }
  }, [data])

  const summary = data!.mood_summary

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard title="Animo y sueno por dia" subtitle="Promedios diarios">
            <LineChartWrapper
              data={moodSleepData}
              lines={[
                { key: 'mood', label: 'Animo', color: CHART_COLORS.primary },
                { key: 'sueno', label: 'Sueno (h)', color: CHART_COLORS.cyan },
              ]}
              height={280}
            />
          </ChartCard>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Resumen animo</h3>
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

      <ChartCard title="Foco de preocupacion por semana" subtitle="Distribucion apilada">
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

function useMergedByDate(
  a: Array<Record<string, unknown> & { date: string }>,
  b: Array<Record<string, unknown> & { date: string }>,
): Array<Record<string, unknown> & { date: string }> {
  return useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const row of a) map.set(row.date, { ...row })
    for (const row of b) {
      const prev = map.get(row.date) ?? { date: row.date }
      map.set(row.date, { ...prev, ...row })
    }
    return Array.from(map.values())
      .sort((x, y) => String(x.date).localeCompare(String(y.date)))
      .map((r) => r as Record<string, unknown> & { date: string })
  }, [a, b])
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="Turnos bajo 20 s"
          value={pctUnder20 == null ? '—' : `${pctUnder20.toFixed(1)} %`}
          threshold={pctThreshold}
          hint="Objetivo: >= 90 %"
        />
        <MetricCard
          label="Costo Gemini estimado"
          value={
            data!.gemini_cost_estimate_usd == null
              ? '—'
              : `US$ ${data!.gemini_cost_estimate_usd.toFixed(2)}`
          }
          hint="Suma del rango"
        />
      </div>

      <ChartCard
        title="Percentiles de latencia"
        subtitle="P50 / P95 / P99 por dia — umbral 20 000 ms"
      >
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
      </ChartCard>

      <ChartCard title="Tokens consumidos por dia" subtitle="Prompt + completion (apilado)">
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
    </div>
  )
}

// ---------------- Tab D: Safety ----------------

interface SafetyResponse {
  safety_events_per_day: Array<{ date: string; count: number }>
  guardrails_type_distribution: Array<{ type: string; count: number }>
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
        />
        <MetricCard
          label="Tipos de guardrails"
          value={(data!.guardrails_type_distribution ?? []).length.toString()}
          hint="Categorias activadas en el rango"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ChartCard title="Safety events por dia" subtitle="Conteo diario">
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
          <ChartCard title="Tipos de guardrails" subtitle="Distribucion">
            <DonutChartWrapper
              data={data!.guardrails_type_distribution.map((g) => ({
                name: g.type,
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
        />
        <MetricCard
          label="Empatia >= 4/5"
          value={pctEmpathy == null ? 'Sin datos suficientes' : `${pctEmpathy.toFixed(1)} %`}
          threshold={empathyThreshold}
          hint="Objetivo: >= 80 %"
        />
        <MetricCard
          label="Comparaciones pre/post"
          value={comparisons.length.toString()}
          hint="Variables emparejadas por usuario"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Distribucion SUS" subtitle="Por rangos de puntaje">
          <BarChartWrapper
            data={data!.sus_distribution.map((b) => ({ bucket: b.bucket, count: b.count }))}
            bars={[{ key: 'count', label: 'Respuestas', color: CHART_COLORS.accent }]}
            xKey="bucket"
            yLabel="Respuestas"
            height={260}
          />
        </ChartCard>
        <ChartCard title="Distribucion de empatia" subtitle="Calificaciones 1-5">
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
            Estadistica inferencial con pares emparejados por usuario
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
  if (t === 'paired_t') return 'Paired t-test (parametrico)'
  if (t === 'wilcoxon') return 'Wilcoxon signed-rank (no parametrico)'
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
          <span className="text-text-primary/50">Test estadistico</span>
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
  const [cohortDraft, setCohortDraft] = useState<string>(cohortParam)
  useEffect(() => {
    setCohortDraft(cohortParam)
  }, [cohortParam])

  // Keep ?tab in sync if missing/invalid
  useEffect(() => {
    if (!isTabKey(initialTab)) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default cohort to piloto-fase1 on Tab E when none is set
  useEffect(() => {
    if (activeTab === 'study' && !searchParams.get('cohort')) {
      const next = new URLSearchParams(searchParams)
      next.set('cohort', 'piloto-fase1')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  function applyCohort() {
    const next = new URLSearchParams(searchParams)
    const v = cohortDraft.trim()
    if (v) next.set('cohort', v)
    else next.delete('cohort')
    setSearchParams(next)
  }

  function clearCohort() {
    const next = new URLSearchParams(searchParams)
    next.delete('cohort')
    setSearchParams(next)
    setCohortDraft('')
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
      addToast({ type: 'error', message: 'Selecciona un rango de fechas valido.' })
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
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Estudio cuasiexperimental
          </p>
          <h1 className="text-2xl font-semibold text-text-primary mt-1">Metricas</h1>
          <p className="text-sm text-text-primary/60 mt-1">
            Indicadores de uso, bienestar, tecnicos, seguridad y estudio.
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
          <div className="flex items-stretch gap-1.5">
            <input
              id="metrics-cohort"
              type="text"
              value={cohortDraft}
              onChange={(e) => setCohortDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyCohort()
                }
              }}
              placeholder="piloto-fase1"
              className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[140px]"
            />
            <button
              type="button"
              onClick={applyCohort}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50"
            >
              Aplicar
            </button>
          </div>
        </div>

        {cohortParam && (
          <button
            type="button"
            onClick={clearCohort}
            className="self-end inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-danger border border-danger/30 hover:bg-danger/5"
          >
            Limpiar cohorte
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
              <span className="font-medium text-accent font-mono">{cohortParam}</span>
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="Tabs de metricas"
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
