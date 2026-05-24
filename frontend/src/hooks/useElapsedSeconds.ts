/**
 * useElapsedSeconds — Cuenta segundos desde que `active` se vuelve true.
 *
 * Cuando active pasa false → resetea a 0. Cuando pasa true → arranca
 * timer cada 500 ms (granularidad fina sin spam de re-renders).
 *
 * Lo usa Chat / Voice para mostrar mensajes progresivos durante el
 * streaming del LLM ("pensando…" → "tomándose su tiempo…" →
 * "despertando del descanso…") sin tocar la lógica del stream.
 */
import { useEffect, useRef, useState } from 'react'

export default function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      startRef.current = performance.now()
      setSeconds(0)
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
        startRef.current = null
      }
    }
    // active false → reset
    setSeconds(0)
    startRef.current = null
    return undefined
  }, [active])

  return seconds
}
