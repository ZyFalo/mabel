/**
 * useLlmPrewarm — Health check al provider LLM en cada mount.
 *
 * Mabel-Gemma4 vive en Modal.com con scale-to-zero (5 min idle → worker
 * apagado). El primer request tras un apagón paga 60-90s de cold start.
 *
 * Esto pega `GET /api/v1/llm/health` cuando el usuario abre el chat, el
 * modo voz o el home: si el worker está dormido, el ping empieza a
 * despertarlo en paralelo a que el usuario lee la pantalla, así cuando
 * escribe su primer mensaje el worker ya está warm.
 *
 * Devuelve el estado para que la UI pueda mostrar "Mabel está
 * despertando..." si está cold.
 *
 * SEMÁNTICA DE ESTADOS (importante — audit 2026-05-23):
 *   warm     → backend devolvió status:'warm' (Modal respondió 200)
 *   cold     → backend devolvió status:'cold' (Modal respondió 503 Loading)
 *   down     → backend devolvió status:'down' (Modal o intermedio caído)
 *   unknown  → algo falló localmente (404 endpoint, sin token, network)
 *              UI NO debe asumir 'warm' — antes lo hacía y enmascaraba
 *              outages reales.
 */
import { useEffect, useState } from 'react'
import { AxiosError } from 'axios'
import apiClient from '../api/client'

export type LlmStatus = 'unknown' | 'warm' | 'cold' | 'down'

interface UseLlmPrewarmReturn {
  status: LlmStatus
  /** True mientras la promesa del health check sigue en vuelo. */
  checking: boolean
  /** Vuelve a chequear (útil tras un retry o cambio de foco). */
  recheck: () => void
}

interface UseLlmPrewarmOptions {
  /** Polling silencioso cada `pollIntervalMs` después del primer check.
   *  Útil para Capa 4 (chip de estado siempre visible en el header).
   *  Si se omite, solo hace UN check al mount. Por defecto omitido. */
  pollIntervalMs?: number
}

export default function useLlmPrewarm(
  options: UseLlmPrewarmOptions = {},
): UseLlmPrewarmReturn {
  const [status, setStatus] = useState<LlmStatus>('unknown')
  const [checking, setChecking] = useState(false)
  const [tick, setTick] = useState(0)
  const { pollIntervalMs } = options

  useEffect(() => {
    // Skip si no hay token — sin esto el prewarm dispara durante el
    // login flicker y un 401 stale dispara el modal session-expired
    // en mount aunque el usuario no haya tocado nada LLM-related.
    const token = localStorage.getItem('mabel_token')
    if (!token) return

    let cancelled = false

    async function checkOnce() {
      setChecking(true)
      try {
        const res = await apiClient.get('/llm/health', { timeout: 20000 })
        if (cancelled) return
        const s = (res.data?.status as LlmStatus) || 'unknown'
        setStatus(s === 'warm' || s === 'cold' || s === 'down' ? s : 'unknown')
      } catch (err) {
        if (cancelled) return
        const axErr = err as AxiosError
        const code = axErr?.response?.status
        if (code === 401 || code === 403) {
          setStatus('unknown')
        } else if (code === 404 || code === 500 || code === 502 || code === 503) {
          setStatus('down')
        } else {
          setStatus('unknown')
        }
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    checkOnce()

    // Polling silencioso opcional para el chip de estado siempre visible.
    let intervalId: number | undefined
    if (pollIntervalMs && pollIntervalMs > 0) {
      intervalId = window.setInterval(checkOnce, pollIntervalMs)
    }

    return () => {
      cancelled = true
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
      }
    }
  }, [tick, pollIntervalMs])

  return { status, checking, recheck: () => setTick((t) => t + 1) }
}
