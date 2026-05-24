/**
 * useLlmPrewarm — Health check al provider LLM en cada mount.
 *
 * Mabel-Gemma4 vive en Modal.com con scale-to-zero (5 min idle → worker
 * apagado). El primer request tras un apagón paga 60-90s de cold start.
 *
 * Esto pega `GET /api/v1/llm/health` cuando el usuario abre el chat o
 * el modo voz: si el worker está dormido, el ping empieza a despertarlo
 * en paralelo a que el usuario lee la pantalla, así cuando escribe su
 * primer mensaje el worker ya está warm.
 *
 * Devuelve el estado para que la UI pueda mostrar "Mabel está
 * despertando..." si está cold.
 */
import { useEffect, useState } from 'react'
import apiClient from '../api/client'

export type LlmStatus = 'unknown' | 'warm' | 'cold' | 'down'

interface UseLlmPrewarmReturn {
  status: LlmStatus
  /** True mientras la promesa del health check sigue en vuelo. */
  checking: boolean
  /** Vuelve a chequear (útil tras un retry o cambio de foco). */
  recheck: () => void
}

export default function useLlmPrewarm(): UseLlmPrewarmReturn {
  const [status, setStatus] = useState<LlmStatus>('unknown')
  const [checking, setChecking] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setChecking(true)
    apiClient
      .get('/llm/health', { timeout: 10000 })
      .then((res) => {
        if (cancelled) return
        const s = (res.data?.status as LlmStatus) || 'unknown'
        setStatus(s === 'warm' || s === 'cold' || s === 'down' ? s : 'unknown')
      })
      .catch(() => {
        if (cancelled) return
        // El endpoint mismo falló — asumimos warm para no bloquear UX.
        // Si el LLM real está caído, el primer mensaje del usuario lo
        // descubrirá con su propio error visible.
        setStatus('warm')
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  return { status, checking, recheck: () => setTick((t) => t + 1) }
}
