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
 * SEMÁNTICA DE ESTADOS (audit 2026-05-24):
 *   warm     → backend devolvió status:'warm' (Modal respondió 200)
 *   cold     → backend devolvió status:'cold' (Modal respondió 503 Loading)
 *   down     → backend devolvió status:'down' (Modal o intermedio caído)
 *   unknown  → algo falló localmente (404 endpoint, sin token, network)
 *
 * COMPORTAMIENTO DE POLLING (audit 2026-05-24):
 *   - Solo polled SI la pestaña está visible (document.visibilityState).
 *     Sin esto los tabs idle pingean 24/7 y Modal scale-to-zero nunca
 *     dispara → factura explota en el piloto. Al volver a visible se
 *     dispara un check inmediato.
 *   - `checking` flag SOLO toggle true en el primer check (mount) y
 *     en recheck() manuales — no en cada poll automático. Sin esto
 *     consumers que rendereen spinner basado en `checking` flickean
 *     cada 30s sin razón.
 */
import { useEffect, useRef, useState } from 'react'
import { AxiosError } from 'axios'
import apiClient from '../api/client'

export type LlmStatus = 'unknown' | 'warm' | 'cold' | 'down'

interface UseLlmPrewarmReturn {
  status: LlmStatus
  /** True SOLO mientras el primer check (o un recheck()) está en vuelo.
   *  No flickea durante el polling automático. */
  checking: boolean
  /** Vuelve a chequear (útil tras un retry o cambio de foco). */
  recheck: () => void
}

interface UseLlmPrewarmOptions {
  /** Polling silencioso cada `pollIntervalMs` después del primer check.
   *  Solo polled cuando el tab está visible. Si se omite, solo un check
   *  al mount. */
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
    const token = localStorage.getItem('mabel_token')
    if (!token) return

    let cancelled = false
    let intervalId: number | undefined
    let firstCheckDone = false

    async function checkOnce(opts: { silent?: boolean } = {}) {
      // Silent = no togglear `checking`. Usado por el polling para no
      // hacer flickear el flag y romper consumers que lo lean como
      // "está cargando ahora mismo".
      const silent = opts.silent ?? false
      if (!silent) setChecking(true)
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
        if (!cancelled && !silent) setChecking(false)
      }
    }

    // Initial check — NO silent (consumer puede querer mostrar
    // spinner durante el primer health check).
    checkOnce().then(() => {
      firstCheckDone = true
    })

    function startInterval() {
      if (intervalId !== undefined) return
      if (!pollIntervalMs || pollIntervalMs <= 0) return
      intervalId = window.setInterval(() => {
        // Solo poll si el tab está visible Y el primer check ya completó.
        // Sin la guard de visibilidad, tabs en background siguen
        // pingueando — Modal scale-to-zero defeat + factura explota.
        if (document.visibilityState !== 'visible') return
        if (!firstCheckDone) return
        checkOnce({ silent: true })
      }, pollIntervalMs)
    }

    function stopInterval() {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Al volver, dispara un check inmediato (silent — el chip se
        // actualiza sin flickear el spinner) y reanuda el intervalo.
        if (firstCheckDone) checkOnce({ silent: true })
        startInterval()
      } else {
        stopInterval()
      }
    }

    if (pollIntervalMs && pollIntervalMs > 0) {
      startInterval()
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      cancelled = true
      stopInterval()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [tick, pollIntervalMs])

  return { status, checking, recheck: () => setTick((t) => t + 1) }
}
