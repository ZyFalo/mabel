import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import MetricCard from '../../components/admin/MetricCard'
import BarChartWrapper from '../../components/admin/charts/BarChartWrapper'
import { CHART_COLORS } from '../../components/admin/charts/chartTheme'
import { useToastStore } from '../../stores/toastStore'

// ============================================================================
// Types
// ============================================================================

interface QueueItem {
  message_id: string
  session_id: string
  content: string
  created_at: string
  session_started_at: string | null
  preceding_user_message?: string | null
}

interface EmpathyStats {
  n: number
  mean: number | null
  distribution: Array<{ bucket: string; count: number }>
  pct_4_or_above: number | null
}

interface CriteriaState {
  empathic_tone: boolean
  emotional_validation: boolean
  no_hallucinations: boolean
  constructive_suggestion: boolean
  no_clinical_diagnosis: boolean
}

const EMPTY_CRITERIA: CriteriaState = {
  empathic_tone: false,
  emotional_validation: false,
  no_hallucinations: false,
  constructive_suggestion: false,
  no_clinical_diagnosis: false,
}

const CRITERIA_LABELS: Array<{ key: keyof CriteriaState; label: string }> = [
  { key: 'empathic_tone', label: 'Tono empatico' },
  { key: 'emotional_validation', label: 'Validacion emocional' },
  { key: 'no_hallucinations', label: 'Sin alucinaciones' },
  { key: 'constructive_suggestion', label: 'Sugerencia constructiva' },
  { key: 'no_clinical_diagnosis', label: 'Sin diagnostico clinico' },
]

const DEFAULT_COHORT = 'piloto-fase1'

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
    })
  } catch {
    return '—'
  }
}

// ============================================================================
// RatingCard
// ============================================================================

function RatingCard({
  item,
  onSubmitted,
  onAlreadyRated,
}: {
  item: QueueItem
  onSubmitted: () => void
  onAlreadyRated: () => void
}) {
  const addToast = useToastStore((s) => s.addToast)
  const [score, setScore] = useState<number | null>(null)
  const [criteria, setCriteria] = useState<CriteriaState>(EMPTY_CRITERIA)
  const [submitting, setSubmitting] = useState(false)

  function toggleCriterion(key: keyof CriteriaState) {
    setCriteria((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSubmit() {
    if (score == null) return
    setSubmitting(true)
    try {
      await apiClient.post('/admin/empathy-ratings', {
        message_id: item.message_id,
        score,
        criteria,
      })
      addToast({ type: 'success', message: 'Calificacion registrada.' })
      onSubmitted()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 409) {
        addToast({
          type: 'warning',
          message: 'Este mensaje ya tenia una calificacion previa.',
        })
        onAlreadyRated()
      } else {
        addToast({
          type: 'error',
          message: e?.response?.data?.detail ?? 'No se pudo registrar la calificacion.',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <header className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-text-primary/60">
          <span className="font-mono text-text-primary/50">
            msg #{item.message_id.slice(0, 8)}
          </span>
          {' · '}
          <span>Sesion {formatDateTime(item.session_started_at)}</span>
        </div>
        <div className="text-[11px] text-text-primary/45">
          Mensaje: {formatDateTime(item.created_at)}
        </div>
      </header>

      {/* Message content */}
      <div className="px-5 py-4 bg-white space-y-3">
        {item.preceding_user_message && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
              Mensaje previo del estudiante (contexto)
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 max-h-[160px] overflow-y-auto">
              <p className="text-sm text-text-primary/70 leading-relaxed whitespace-pre-wrap italic">
                {item.preceding_user_message}
              </p>
            </div>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
            Respuesta del asistente
          </p>
          <div className="bg-accent/3 border border-accent/15 rounded-md px-4 py-3 max-h-[260px] overflow-y-auto">
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
              {item.content}
            </p>
          </div>
        </div>
      </div>

      {/* Scoring */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
          Puntaje de empatia (1 a 5)
        </p>
        <div
          role="radiogroup"
          aria-label="Puntaje de empatia"
          className="flex items-center gap-2"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = score === n
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setScore(n)}
                disabled={submitting}
                className={[
                  'w-11 h-11 rounded-lg border text-base font-semibold transition-all',
                  selected
                    ? 'bg-primary text-white border-primary shadow-sm scale-105'
                    : 'bg-white text-text-primary border-gray-300 hover:border-primary/40 hover:bg-primary/5',
                  submitting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
          <span className="ml-3 text-[11px] text-text-primary/50">
            1 = muy bajo · 5 = excelente
          </span>
        </div>
      </div>

      {/* Criteria */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
          Criterios cualitativos
        </p>
        <div className="flex flex-wrap gap-2">
          {CRITERIA_LABELS.map(({ key, label }) => {
            const checked = criteria[key]
            return (
              <label
                key={key}
                className={[
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-colors',
                  checked
                    ? 'bg-success/8 text-success border-success/30'
                    : 'bg-white text-text-primary/70 border-gray-300 hover:bg-gray-50',
                  submitting ? 'opacity-60 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={submitting}
                  onChange={() => toggleCriterion(key)}
                />
                <span
                  aria-hidden="true"
                  className={[
                    'w-3.5 h-3.5 rounded-sm border-2 inline-flex items-center justify-center shrink-0',
                    checked ? 'bg-success border-success' : 'border-gray-400',
                  ].join(' ')}
                >
                  {checked && (
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6.5L5 9L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {label}
              </label>
            )
          })}
        </div>
      </div>

      {/* Footer / submit */}
      <footer className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || score == null}
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Enviando…' : 'Calificar'}
        </button>
      </footer>
    </article>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function EmpathyRatings() {
  const [searchParams, setSearchParams] = useSearchParams()

  const cohortParam = searchParams.get('cohort')

  // Initialize default cohort on first mount if absent
  useEffect(() => {
    if (cohortParam == null) {
      const next = new URLSearchParams(searchParams)
      next.set('cohort', DEFAULT_COHORT)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cohort = cohortParam ?? DEFAULT_COHORT
  const [cohortDraft, setCohortDraft] = useState<string>(cohort)
  useEffect(() => {
    setCohortDraft(cohort)
  }, [cohort])

  const [stats, setStats] = useState<EmpathyStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueError, setQueueError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const params: Record<string, string> = {}
      if (cohort.trim()) params.cohort = cohort.trim()
      const res = await apiClient.get<EmpathyStats>('/admin/empathy-ratings/stats', {
        params,
      })
      setStats(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setStatsError(e?.response?.data?.detail ?? 'No se pudieron cargar las estadisticas.')
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [cohort])

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError(null)
    try {
      const params: Record<string, string | number> = { limit: 20 }
      if (cohort.trim()) params.cohort = cohort.trim()
      const res = await apiClient.get<QueueItem[] | { items: QueueItem[] }>(
        '/admin/empathy-ratings/queue',
        { params },
      )
      const items = Array.isArray(res.data)
        ? res.data
        : (res.data?.items ?? [])
      setQueue(items)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setQueueError(e?.response?.data?.detail ?? 'No se pudo cargar la cola.')
      setQueue([])
    } finally {
      setQueueLoading(false)
    }
  }, [cohort])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

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

  function removeItem(messageId: string) {
    setQueue((prev) => prev.filter((it) => it.message_id !== messageId))
  }

  const pctThreshold: 'green' | 'yellow' | 'red' | undefined = useMemo(() => {
    if (stats?.pct_4_or_above == null) return undefined
    if (stats.pct_4_or_above >= 80) return 'green'
    if (stats.pct_4_or_above >= 60) return 'yellow'
    return 'red'
  }, [stats])

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <header className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          Calidad de respuestas
        </p>
        <h1 className="text-2xl font-semibold text-text-primary mt-1">
          Calificacion de empatia
        </h1>
        <p className="text-sm text-text-primary/60 mt-1">
          Califica las respuestas del asistente para alimentar la metrica de empatia &gt;= 4/5.
          Cada mensaje se evalua una sola vez por administrador.
        </p>
      </header>

      {/* Toolbar */}
      <section
        aria-label="Controles"
        className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label
            htmlFor="empathy-cohort"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
          >
            Cohorte
          </label>
          <div className="flex items-stretch gap-1.5">
            <input
              id="empathy-cohort"
              type="text"
              value={cohortDraft}
              onChange={(e) => setCohortDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyCohort()
                }
              }}
              placeholder={DEFAULT_COHORT}
              className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[160px]"
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

        {cohort && (
          <button
            type="button"
            onClick={clearCohort}
            className="self-end inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-danger border border-danger/30 hover:bg-danger/5"
          >
            Limpiar cohorte
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            fetchStats()
            fetchQueue()
          }}
          className="self-end inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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

        <div className="ml-auto text-[11px] text-text-primary/50 tabular-nums text-right">
          {cohort ? (
            <>
              Cohorte:{' '}
              <span className="font-medium text-accent font-mono">{cohort}</span>
            </>
          ) : (
            'Sin filtro de cohorte'
          )}
        </div>
      </section>

      {/* Stats panel */}
      <section aria-label="Estadisticas globales" className="mb-6">
        {statsError ? (
          <div
            role="alert"
            className="border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
          >
            <span>{statsError}</span>
            <button
              type="button"
              onClick={fetchStats}
              className="text-xs font-semibold underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <MetricCard
                label="Total calificaciones"
                value={statsLoading ? '…' : (stats?.n ?? 0).toLocaleString('es-CO')}
                hint="En la cohorte seleccionada"
              />
              <MetricCard
                label="Promedio"
                value={
                  statsLoading
                    ? '…'
                    : stats?.mean == null
                      ? '—'
                      : stats.mean.toFixed(2)
                }
                hint="Escala 1 a 5"
              />
              <MetricCard
                label="Pct >= 4"
                value={
                  statsLoading
                    ? '…'
                    : stats?.pct_4_or_above == null
                      ? '—'
                      : `${stats.pct_4_or_above.toFixed(1)} %`
                }
                threshold={pctThreshold}
                hint="Objetivo: >= 80 %"
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-text-primary mb-3">
                Distribucion de puntajes
              </h2>
              <BarChartWrapper
                data={(stats?.distribution ?? []).map((b) => ({
                  bucket: b.bucket,
                  count: b.count,
                }))}
                bars={[
                  {
                    key: 'count',
                    label: 'Calificaciones',
                    color: CHART_COLORS.primary,
                  },
                ]}
                xKey="bucket"
                yLabel="Calificaciones"
                height={240}
              />
            </div>
          </>
        )}
      </section>

      {/* Queue */}
      <section aria-label="Cola de mensajes a calificar">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Cola pendiente ({queue.length})
          </h2>
          <button
            type="button"
            onClick={fetchQueue}
            disabled={queueLoading}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50 disabled:opacity-50"
          >
            {queueLoading ? 'Cargando…' : 'Cargar mas'}
          </button>
        </div>

        {queueError ? (
          <div
            role="alert"
            className="border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger"
          >
            {queueError}
          </div>
        ) : queueLoading && queue.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-sm text-text-primary/50">
            Cargando cola…
          </div>
        ) : queue.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center">
            <p className="text-sm font-medium text-text-primary/60">
              No hay mensajes pendientes de calificar
            </p>
            <p className="text-[12px] text-text-primary/45 mt-1">
              Vuelve a intentarlo mas tarde o cambia el filtro de cohorte.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {queue.map((item) => (
              <RatingCard
                key={item.message_id}
                item={item}
                onSubmitted={() => {
                  removeItem(item.message_id)
                  fetchStats()
                }}
                onAlreadyRated={() => {
                  removeItem(item.message_id)
                  fetchStats()
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
