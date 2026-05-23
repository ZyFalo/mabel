import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

/**
 * Calificacion de 1-5 corazones (mas = mejor) que el estudiante puede
 * dar a una sesion despues de finalizada. Se renderea como ribbon
 * arriba del header del chat. Funciona idempotente: cada click guarda
 * (PUT) y el backend resuelve UPSERT vía UNIQUE(session_id, user_id).
 *
 * El estudiante puede volver a la sesion en cualquier momento y
 * cambiar la calificacion. Eso es deliberado — la primera reaccion
 * post-cierre puede diferir del juicio reflexivo despues.
 */
export default function HeartRating({ sessionId }: { sessionId: string }) {
  const addToast = useToastStore((s) => s.addToast)
  const [rating, setRating] = useState<number | null>(null)
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Cancellation-safe fetch: si el usuario navega rapido entre sesiones,
  // descartamos respuestas tardias para no pisar el estado actual.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiClient
      .get(`/sessions/${sessionId}/rating`)
      .then((res) => {
        if (cancelled) return
        // El backend devuelve `null` si nunca se califico.
        const data = res.data as { rating?: number } | null
        setRating(data?.rating ?? null)
      })
      .catch(() => {
        // Falla silenciosa: el banner aparece como "sin calificar" y el
        // usuario puede intentar de nuevo. No queremos toast rojo aqui
        // porque es metadata accesoria, no crítica para el chat.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  async function handleSelect(value: number) {
    if (saving || loading) return
    // Click sobre el rating actual → permite "limpiar" volviendo a 0,
    // pero como el backend exige rating >= 1, mostramos un toast
    // explicativo y dejamos el estado. Alternativamente podriamos
    // implementar DELETE rating, pero no esta en el alcance MVP.
    if (value === rating) return

    const previous = rating
    setRating(value) // optimistic
    setSaving(true)
    try {
      await apiClient.put(`/sessions/${sessionId}/rating`, { rating: value })
      addToast({
        type: 'success',
        message: previous == null ? 'Gracias por tu calificación' : 'Calificación actualizada',
      })
    } catch {
      // Rollback optimista si falla.
      setRating(previous)
      addToast({
        type: 'error',
        message: 'No pudimos guardar la calificación. Intenta de nuevo.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Determina cuántos corazones se ven "llenos" (rojo) en cada momento.
  // Durante hover, mostramos preview del valor que se aplicaría al click.
  const displayValue = hoverValue ?? rating ?? 0

  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 20px',
        background: 'var(--mabel-50, #FDF2F2)',
        borderBottom: '1px solid var(--mabel-100, #F8E0DE)',
        fontFamily: 'var(--font-sans)',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}
      >
        <Heart size={14} color="var(--mabel-600)" fill="var(--mabel-600)" aria-hidden="true" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink-900)',
            lineHeight: 1.3,
          }}
        >
          {rating == null
            ? '¿Cómo fue esta conversación?'
            : '¡Gracias! ¿Quieres cambiar tu calificación?'}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Calificar conversación de 1 a 5 corazones"
        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        onMouseLeave={() => setHoverValue(null)}
      >
        {[1, 2, 3, 4, 5].map((value) => {
          const active = value <= displayValue
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} de 5 corazones`}
              onClick={() => handleSelect(value)}
              onMouseEnter={() => setHoverValue(value)}
              disabled={saving || loading}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: saving || loading ? 'default' : 'pointer',
                padding: 4,
                lineHeight: 0,
                transition: 'transform 0.12s ease',
                transform: hoverValue != null && hoverValue >= value ? 'scale(1.15)' : 'scale(1)',
              }}
            >
              <Heart
                size={20}
                color="var(--mabel-600)"
                fill={active ? 'var(--mabel-600)' : 'transparent'}
                strokeWidth={active ? 1.8 : 1.6}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
