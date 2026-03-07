import { useCallback, useEffect, useRef, useState } from 'react'

interface ConnectionErrorProps {
  onRetry: () => void
}

const BACKOFF_SEQUENCE = [3, 6, 12, 24, 30]

export default function ConnectionError({ onRetry }: ConnectionErrorProps) {
  const [countdown, setCountdown] = useState(BACKOFF_SEQUENCE[0])
  const [attempt, setAttempt] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    startCountdown(BACKOFF_SEQUENCE[0])
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [startCountdown])

  useEffect(() => {
    if (countdown === 0) {
      const nextAttempt = attempt + 1
      setAttempt(nextAttempt)
      onRetry()
      const nextDelay = BACKOFF_SEQUENCE[Math.min(nextAttempt, BACKOFF_SEQUENCE.length - 1)]
      startCountdown(nextDelay)
    }
  }, [countdown, attempt, onRetry, startCountdown])

  function handleManualRetry() {
    if (timerRef.current) clearInterval(timerRef.current)
    setAttempt(0)
    onRetry()
    startCountdown(BACKOFF_SEQUENCE[0])
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <svg className="w-16 h-16 text-text-primary/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01" />
      </svg>
      <h2 className="text-lg font-bold text-text-primary mb-2">Sin conexion</h2>
      <p className="text-sm text-text-primary/60 mb-4 max-w-sm">
        Revisa tu conexion a Internet. Mabel IA necesita conexion para funcionar.
      </p>
      <p className="text-xs text-text-primary/40 mb-4">
        Reintentando en {countdown}s...
      </p>
      <button
        onClick={handleManualRetry}
        className="px-5 py-2.5 bg-primary text-white text-sm rounded-lg font-medium hover:bg-primary/90 transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
