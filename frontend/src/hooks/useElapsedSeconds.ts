/**
 * useElapsedSeconds — Cuenta segundos desde que `active` se vuelve true.
 *
 * Cuando active pasa false → resetea a 0. Cuando pasa true → arranca
 * timer cada 500 ms (granularidad fina sin spam de re-renders).
 *
 * Lo usa Chat / Voice para mostrar mensajes progresivos durante el
 * streaming del LLM ("pensando…" → "tomándose su tiempo…" →
 * "despertando del descanso…") sin tocar la lógica del stream.
 *
 * GRACIA ANTE TOGGLES RÁPIDOS (audit 2026-05-24):
 * Si `active` flickea true→false→true en menos de `gracePeriodMs`
 * (default 600 ms), preserva el startRef del primer true. Esto evita
 * que el counter se resetee visualmente bajo SSE reconnect breve o
 * React 18 Strict Mode (que doble-invoca effects en dev).
 */
import { useEffect, useRef, useState } from 'react'

const GRACE_PERIOD_MS = 600

export default function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef<number | null>(null)
  const lastDeactivateRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      const now = performance.now()
      // Si volvemos a active=true dentro de la gracia, preservamos el
      // start original. Sin esto un blip de SSE o el doble-invoke de
      // Strict Mode resetean el counter visualmente, undermineando
      // la escalación de mensajes ("despertando…" vuelve a "pensando…"
      // a mitad del wait).
      const withinGrace =
        lastDeactivateRef.current !== null &&
        now - lastDeactivateRef.current < GRACE_PERIOD_MS &&
        startRef.current !== null

      if (!withinGrace) {
        startRef.current = now
        setSeconds(0)
      }
      lastDeactivateRef.current = null

      intervalRef.current = window.setInterval(() => {
        if (startRef.current == null) return
        const s = Math.floor((performance.now() - startRef.current) / 1000)
        setSeconds(s)
      }, 500)

      return () => {
        if (intervalRef.current != null) {
          window.clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        // Marca el momento de la desactivación para que un re-active
        // dentro de la gracia preserve el start.
        lastDeactivateRef.current = performance.now()
      }
    }

    // active=false fuera de gracia → reset real
    // No tocamos startRef aquí porque la próxima activación lo va a
    // setear (o preservar si está en gracia).
    setSeconds(0)
    return undefined
  }, [active])

  return seconds
}
