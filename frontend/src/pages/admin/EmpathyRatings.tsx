import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import InfoHint from '../../components/admin/InfoHint'
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

interface QueueResponse {
  items: QueueItem[]
  total_pending: number
}

// Item rendered in the "Calificadas" tab. Bundles a `QueueItem`-shaped
// message context with the rating itself (id, score, criteria, timestamps),
// the rater identity, and an `is_mine` flag so the UI can decide whether
// to expose edit controls or render read-only.
interface RatedItem {
  rating_id: string
  score: number
  criteria: Partial<CriteriaState> | Record<string, unknown> | null
  created_at: string
  updated_at: string | null
  rater_id: string | null
  rater_email_masked: string | null
  is_mine: boolean
  message_id: string
  session_id: string
  content: string
  message_created_at: string
  session_started_at: string | null
  preceding_user_message: string | null
}

interface RatedResponse {
  items: RatedItem[]
  total: number
}

type QueueTab = 'pending' | 'rated'

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
  { key: 'empathic_tone', label: 'Tono empático' },
  { key: 'emotional_validation', label: 'Validación emocional' },
  { key: 'no_hallucinations', label: 'Sin alucinaciones' },
  { key: 'constructive_suggestion', label: 'Sugerencia constructiva' },
  { key: 'no_clinical_diagnosis', label: 'Sin diagnóstico clínico' },
]

// NOTE: previously a hardcoded `piloto-fase1` was auto-set on mount. Removed
// in favour of an explicit cohort selection (matches the Metrics tab Estudio
// pattern). The list of valid cohorts is loaded from `/admin/users/cohorts`.

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

/**
 * Normalize a free-form `criteria` object (from API) into a strict
 * `CriteriaState` for the UI. Older ratings may have used different keys
 * (we found `{'tone': true}` in DB historically); unknown keys are ignored
 * gracefully so the card never crashes on legacy data.
 */
function toCriteriaState(
  raw: Partial<CriteriaState> | Record<string, unknown> | null | undefined,
): CriteriaState {
  const out: CriteriaState = { ...EMPTY_CRITERIA }
  if (!raw || typeof raw !== 'object') return out
  for (const k of Object.keys(EMPTY_CRITERIA) as Array<keyof CriteriaState>) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

interface RatingCardProps {
  // Common message context (shape compatible with QueueItem). For the rated
  // tab we receive a RatedItem and adapt: `message_created_at` becomes
  // `created_at` for display purposes.
  item: QueueItem
  /**
   * Pre-existing rating context. When present the card switches from
   * "create" mode to "edit" (when `is_mine`) or "view" (when not). The
   * PATCH endpoint is used instead of POST.
   */
  existingRating?: {
    rating_id: string
    score: number
    criteria: Partial<CriteriaState> | Record<string, unknown> | null
    created_at: string
    updated_at: string | null
    rater_email_masked: string | null
    is_mine: boolean
  }
  onSubmitted: () => void
  onAlreadyRated: () => void
}

function RatingCard({
  item,
  existingRating,
  onSubmitted,
  onAlreadyRated,
}: RatingCardProps) {
  const addToast = useToastStore((s) => s.addToast)
  // Mode: 'create' (no existingRating), 'edit' (existingRating + is_mine),
  // 'view' (existingRating + !is_mine — other rater's, read-only).
  const mode: 'create' | 'edit' | 'view' = existingRating
    ? existingRating.is_mine
      ? 'edit'
      : 'view'
    : 'create'
  const readOnly = mode === 'view'

  const [score, setScore] = useState<number | null>(
    existingRating ? existingRating.score : null,
  )
  const [criteria, setCriteria] = useState<CriteriaState>(
    existingRating ? toCriteriaState(existingRating.criteria) : EMPTY_CRITERIA,
  )
  const [submitting, setSubmitting] = useState(false)

  function toggleCriterion(key: keyof CriteriaState) {
    if (readOnly) return
    setCriteria((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSubmit() {
    if (score == null || readOnly) return
    setSubmitting(true)
    try {
      if (mode === 'edit' && existingRating) {
        await apiClient.patch(
          `/admin/empathy-ratings/${existingRating.rating_id}`,
          { score, criteria },
        )
        addToast({ type: 'success', message: 'Calificación actualizada.' })
        onSubmitted()
      } else {
        await apiClient.post('/admin/empathy-ratings', {
          message_id: item.message_id,
          score,
          criteria,
        })
        addToast({ type: 'success', message: 'Calificación registrada.' })
        onSubmitted()
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      const httpStatus = e?.response?.status
      if (httpStatus === 409) {
        addToast({
          type: 'warning',
          message: 'Este mensaje ya tenía una calificación previa.',
        })
        onAlreadyRated()
      } else if (httpStatus === 403) {
        addToast({
          type: 'error',
          message: 'Solo el autor de la calificación puede editarla.',
        })
      } else {
        addToast({
          type: 'error',
          message: e?.response?.data?.detail ?? 'No se pudo registrar la calificación.',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Backend treats the absence of a preceding user message as "this is the
  // first assistant turn of the session" — i.e. the auto-generated greeting
  // based on the student's check-in. Flagging it explicitly avoids the rater
  // mis-scoring the response as "Mabel didn't answer" when there's nothing
  // to answer to.
  const isAutoGreeting =
    !item.preceding_user_message ||
    item.preceding_user_message.trim().length === 0

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <header className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center text-[11px] text-text-primary/60" style={{ gap: 10 }}>
          <span className="font-mono text-text-primary/50">
            msg #{item.message_id.slice(0, 8)}
          </span>
          <span>·</span>
          <span>Sesión {formatDateTime(item.session_started_at)}</span>
          {isAutoGreeting && (
            <span
              title="Es la primera respuesta del asistente en la sesión, generada automáticamente a partir del check-in del estudiante. No hay input previo que responder."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: 'var(--info-50)',
                color: 'var(--info-600)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
              }}
            >
              Saludo automático
            </span>
          )}
          {existingRating && (
            <span
              title={
                existingRating.is_mine
                  ? 'Lo calificaste tú. Puedes editar.'
                  : `Calificado por ${existingRating.rater_email_masked ?? 'otro admin'}. Solo lectura.`
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: existingRating.is_mine
                  ? 'var(--success-50)'
                  : 'var(--ink-100)',
                color: existingRating.is_mine
                  ? 'var(--success-700)'
                  : 'var(--ink-600)',
                border: existingRating.is_mine
                  ? '1px solid var(--success-200)'
                  : '1px solid var(--ink-200)',
              }}
            >
              {existingRating.is_mine ? 'Tu calificación' : 'Otro evaluador'}
            </span>
          )}
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
          <div
            style={{
              background: 'var(--mabel-50)',
              border: '1px solid var(--mabel-200)',
              borderRadius: 'var(--r-md)',
              padding: '12px 16px',
              maxHeight: 260,
              overflowY: 'auto',
              // Prevent scroll chaining: when the rater reaches the end of
              // this scrollable assistant-message box, the wheel/trackpad
              // gesture should NOT propagate to the page below and keep
              // scrolling the queue.
              overscrollBehavior: 'contain',
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-900)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {item.content}
            </p>
          </div>
        </div>
      </div>

      {/* Scoring */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
          Puntaje de empatía (1 a 5)
        </p>
        <div
          role="radiogroup"
          aria-label="Puntaje de empatía"
          className="flex items-center gap-2"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = score === n
            const disabledForReadOnly = submitting || readOnly
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !readOnly && setScore(n)}
                disabled={disabledForReadOnly}
                className={[
                  'w-11 h-11 rounded-lg border text-base font-semibold transition-all',
                  selected
                    ? 'bg-primary text-white border-primary shadow-sm scale-105'
                    : 'bg-white text-text-primary border-gray-300 hover:border-primary/40 hover:bg-primary/5',
                  disabledForReadOnly
                    ? 'opacity-60 cursor-not-allowed'
                    : 'cursor-pointer',
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
            const disabled = submitting || readOnly
            return (
              // Implementado como `<button role="checkbox">` (no como
              // `<label><input sr-only/></label>`) a propósito: el input
              // visualmente oculto con `position: absolute` causaba que el
              // browser disparara `scrollIntoView` al hacerle focus tras
              // click, lo que se manifestaba como un "salto" del viewport
              // hacia abajo cuando el scrollbar estaba al final. Un button
              // nativo está en el flujo normal, conserva accesibilidad
              // (Enter/Space, `aria-checked`) y no provoca el auto-scroll.
              <button
                key={key}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => toggleCriterion(key)}
                className={[
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                  checked
                    ? 'bg-success/10 text-success border-success/30'
                    : 'bg-white text-text-primary/70 border-gray-300 hover:bg-gray-50',
                  disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                ].join(' ')}
              >
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
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-5 py-3 border-t border-gray-100 bg-gray-50/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-text-primary/50">
          {existingRating ? (
            <>
              Calificado el{' '}
              <span className="text-text-primary/70 tabular-nums">
                {formatDateTime(existingRating.created_at)}
              </span>
              {existingRating.updated_at && (
                <>
                  {' · editado el '}
                  <span className="text-text-primary/70 tabular-nums">
                    {formatDateTime(existingRating.updated_at)}
                  </span>
                </>
              )}
              {!existingRating.is_mine && existingRating.rater_email_masked && (
                <>
                  {' · por '}
                  <span className="font-mono">
                    {existingRating.rater_email_masked}
                  </span>
                </>
              )}
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || score == null}
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? mode === 'edit'
                ? 'Actualizando…'
                : 'Enviando…'
              : mode === 'edit'
                ? 'Actualizar calificación'
                : 'Calificar'}
          </button>
        )}
      </footer>
    </article>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function EmpathyRatings() {
  const [searchParams, setSearchParams] = useSearchParams()

  const cohort = searchParams.get('cohort') ?? ''

  // Distinct cohorts for the select. Same source as the Métricas page so
  // when an admin assigns a new cohort in /admin/users/:id it shows up
  // here automatically on reload.
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
    if (cohort) set.add(cohort)
    return Array.from(set).sort()
  }, [cohorts, cohort])

  const [stats, setStats] = useState<EmpathyStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  // Total real de mensajes sin calificar en la cohorte (devuelto por el
  // backend). Permite mostrar "mostrando N de M" y ocultar el botón "Cargar
  // más" cuando ya están todos cargados.
  const [totalPending, setTotalPending] = useState(0)
  const [queueLoading, setQueueLoading] = useState(true)

  // "Calificadas" tab: cross-rater ratings of the cohort (user explicitly
  // asked for visibility across raters for inter-rater reliability).
  const [rated, setRated] = useState<RatedItem[]>([])
  const [ratedTotal, setRatedTotal] = useState(0)
  const [ratedLoading, setRatedLoading] = useState(false)
  const [ratedError, setRatedError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<QueueTab>('pending')
  const [queueError, setQueueError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    if (!cohort) {
      setStats(null)
      setStatsLoading(false)
      setStatsError(null)
      return
    }
    setStatsLoading(true)
    setStatsError(null)
    try {
      const res = await apiClient.get<EmpathyStats>('/admin/empathy-ratings/stats', {
        params: { cohort },
      })
      setStats(res.data)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setStatsError(e?.response?.data?.detail ?? 'No se pudieron cargar las estadísticas.')
      setStats(null)
    } finally {
      setStatsLoading(false)
    }
  }, [cohort])

  const fetchQueue = useCallback(async () => {
    if (!cohort) {
      setQueue([])
      setTotalPending(0)
      setQueueLoading(false)
      setQueueError(null)
      return
    }
    setQueueLoading(true)
    setQueueError(null)
    try {
      const res = await apiClient.get<QueueResponse | QueueItem[]>(
        '/admin/empathy-ratings/queue',
        { params: { limit: 20, cohort } },
      )
      // Backend post-Evolución 007 devuelve `{items, total_pending}`. Mantenemos
      // tolerancia con la forma vieja (array plano) por si un proxy intermedio
      // sirvió una versión cacheada — los tipos lo permiten y el fallback usa
      // `length` como aproximación del total.
      if (Array.isArray(res.data)) {
        setQueue(res.data)
        setTotalPending(res.data.length)
      } else {
        setQueue(res.data?.items ?? [])
        setTotalPending(res.data?.total_pending ?? 0)
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setQueueError(e?.response?.data?.detail ?? 'No se pudo cargar la cola.')
      setQueue([])
      setTotalPending(0)
    } finally {
      setQueueLoading(false)
    }
  }, [cohort])

  const fetchRated = useCallback(async () => {
    if (!cohort) {
      setRated([])
      setRatedTotal(0)
      setRatedLoading(false)
      setRatedError(null)
      return
    }
    setRatedLoading(true)
    setRatedError(null)
    try {
      const res = await apiClient.get<RatedResponse>(
        '/admin/empathy-ratings/rated',
        { params: { cohort } },
      )
      setRated(res.data?.items ?? [])
      setRatedTotal(res.data?.total ?? 0)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setRatedError(
        e?.response?.data?.detail ?? 'No se pudieron cargar las calificaciones.',
      )
      setRated([])
      setRatedTotal(0)
    } finally {
      setRatedLoading(false)
    }
  }, [cohort])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useEffect(() => {
    // Sólo cargamos el listado de calificadas cuando el rater entra a esa
    // pestaña — evita una request innecesaria en cada cambio de cohorte
    // mientras está en "Pendientes".
    if (activeTab === 'rated') {
      fetchRated()
    }
  }, [activeTab, fetchRated])

  // Apply cohort changes immediately on select change (no Apply button).
  function setCohort(next_cohort: string) {
    const next = new URLSearchParams(searchParams)
    if (next_cohort) next.set('cohort', next_cohort)
    else next.delete('cohort')
    setSearchParams(next)
  }

  function removeItem(messageId: string) {
    setQueue((prev) => prev.filter((it) => it.message_id !== messageId))
    // El mensaje deja de estar pendiente (cualquier rater lo califica una
    // sola vez). Decrementamos el total real para que el contador
    // "(N)" y "mostrando X de N" se mantengan honestos sin esperar al
    // próximo refetch.
    setTotalPending((prev) => Math.max(0, prev - 1))
  }

  const pctThreshold: 'green' | 'yellow' | 'red' | undefined = useMemo(() => {
    if (stats?.pct_4_or_above == null) return undefined
    if (stats.pct_4_or_above >= 80) return 'green'
    if (stats.pct_4_or_above >= 60) return 'yellow'
    return 'red'
  }, [stats])

  return (
    <div
      className="fade-in"
      style={{
        padding: 32,
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
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
          Calidad de respuestas
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
          Calificación de empatía
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--ink-500)',
            marginTop: 6,
            marginBottom: 0,
          }}
        >
          Califica las respuestas del asistente para alimentar la métrica de empatía &gt;= 4/5.
          Cada mensaje se evalúa una sola vez por administrador.
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
          <select
            id="empathy-cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            disabled={!cohortsLoaded}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-w-[180px] disabled:opacity-60"
          >
            <option value="">Seleccionar cohorte…</option>
            {cohortOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {cohort && (
          <button
            type="button"
            onClick={() => setCohort('')}
            className="self-end inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-medium text-danger border border-danger/30 hover:bg-danger/5"
          >
            Quitar filtro
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
              <span
                className="font-mono font-medium"
                style={{ color: 'var(--mabel-700)' }}
              >
                {cohort}
              </span>
            </>
          ) : (
            'Sin filtro de cohorte'
          )}
        </div>
      </section>

      {/* Cohort required: empty state */}
      {!cohort && (
        <div className="bg-white border border-gray-200 rounded-lg px-6 py-10 text-center flex flex-col items-center gap-2 mb-6">
          <p className="text-sm font-semibold text-text-primary">
            Selecciona una cohorte para empezar a calificar.
          </p>
          <p className="text-[12px] text-text-primary/60 max-w-md">
            Las calificaciones se contabilizan por cohorte para alimentar la
            métrica de empatía del estudio cuasi-experimental. Sin filtro de
            cohorte se mezclarían respuestas del piloto con tráfico de cuentas
            de prueba.
          </p>
        </div>
      )}

      {/* Stats panel */}
      {cohort && (
      <section aria-label="Estadísticas globales" className="mb-6">
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
                info="Cuántas calificaciones de empatía se han registrado para mensajes de esta cohorte. Crece a medida que cada admin evalúa mensajes nuevos."
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
                info="Media simple del puntaje de empatía (1=sin empatía, 5=altamente empática). Indicador rápido de la calidad general de las respuestas de Mabel."
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
                info="Porcentaje de calificaciones con score 4 o 5. Criterio de éxito del estudio cuasi-experimental: la respuesta empática debe alcanzar ≥ 80%."
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-3" style={{ gap: 6 }}>
                <h2 className="text-sm font-semibold text-text-primary">
                  Distribución de puntajes
                </h2>
                <InfoHint text="Cuántas calificaciones cayeron en cada nivel (1-5). Permite ver si el promedio agregado oculta una cola con notas bajas o si hay consenso." />
              </div>
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
      )}

      {/* Tabs + listas */}
      {cohort && (
      <section aria-label="Mensajes a calificar y calificados">
        {/* Tab toggle */}
        <div
          role="tablist"
          aria-label="Pendientes vs calificadas"
          className="flex items-center mb-3"
          style={{ gap: 4 }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
            className={[
              'inline-flex items-center px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors',
              activeTab === 'pending'
                ? 'bg-primary text-white'
                : 'bg-white text-text-primary/70 border border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
            Pendientes ({totalPending})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rated'}
            onClick={() => setActiveTab('rated')}
            className={[
              'inline-flex items-center px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors',
              activeTab === 'rated'
                ? 'bg-primary text-white'
                : 'bg-white text-text-primary/70 border border-gray-300 hover:bg-gray-50',
            ].join(' ')}
          >
            Calificadas ({ratedTotal})
          </button>
        </div>

        {/* --- PENDING TAB --- */}
        {activeTab === 'pending' && (
          <>
            <div
              className="flex items-center justify-between mb-3 flex-wrap"
              style={{ gap: 8 }}
            >
              {totalPending > 0 && (
                <span className="text-[11px] text-text-primary/50 tabular-nums">
                  mostrando {queue.length} de {totalPending}
                </span>
              )}
              {/* "Cargar más" sólo aparece cuando hay más pendientes que los
                  cargados. Cuando ya están todos en pantalla el botón se
                  oculta para no engañar. */}
              {queue.length < totalPending && (
                <button
                  type="button"
                  onClick={fetchQueue}
                  disabled={queueLoading}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50 disabled:opacity-50"
                >
                  {queueLoading ? 'Cargando…' : 'Cargar más'}
                </button>
              )}
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
                  Vuelve a intentarlo más tarde o cambia el filtro de cohorte.
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
                      // Pre-cargar la pestaña "Calificadas" en background
                      // para que su contador esté actualizado cuando el
                      // rater entre a verla.
                      fetchRated()
                    }}
                    onAlreadyRated={() => {
                      removeItem(item.message_id)
                      fetchStats()
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* --- RATED TAB --- */}
        {activeTab === 'rated' && (
          <>
            {ratedError ? (
              <div
                role="alert"
                className="border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
              >
                <span>{ratedError}</span>
                <button
                  type="button"
                  onClick={fetchRated}
                  className="text-[11px] font-semibold underline hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            ) : ratedLoading && rated.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center text-sm text-text-primary/50">
                Cargando calificaciones…
              </div>
            ) : rated.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-12 text-center">
                <p className="text-sm font-medium text-text-primary/60">
                  Aún no hay mensajes calificados en esta cohorte
                </p>
                <p className="text-[12px] text-text-primary/45 mt-1">
                  Empieza calificando desde la pestaña <strong>Pendientes</strong>.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {rated.map((r) => (
                  <RatingCard
                    key={r.rating_id}
                    item={{
                      message_id: r.message_id,
                      session_id: r.session_id,
                      content: r.content,
                      // Para el RatingCard `created_at` es el del MENSAJE
                      // (lo muestra como "Mensaje: dd/mm/aaaa"). En el
                      // payload del backend este campo viene como
                      // `message_created_at` para no chocar con el
                      // `created_at` del rating.
                      created_at: r.message_created_at,
                      session_started_at: r.session_started_at,
                      preceding_user_message: r.preceding_user_message,
                    }}
                    existingRating={{
                      rating_id: r.rating_id,
                      score: r.score,
                      criteria: r.criteria,
                      created_at: r.created_at,
                      updated_at: r.updated_at,
                      rater_email_masked: r.rater_email_masked,
                      is_mine: r.is_mine,
                    }}
                    onSubmitted={() => {
                      // Re-fetch para refrescar el updated_at; mantener stats.
                      fetchRated()
                      fetchStats()
                    }}
                    onAlreadyRated={() => {
                      fetchRated()
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
      )}
    </div>
  )
}
