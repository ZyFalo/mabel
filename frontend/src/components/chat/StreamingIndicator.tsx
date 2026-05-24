/**
 * StreamingIndicator — Indicador de "Mabel está pensando" con texto
 * progresivo según los segundos transcurridos.
 *
 * Antes había dos copias casi-iguales en Chat.tsx (welcome y mid-
 * conversation). Una sola fuente reduce drift cuando ajustamos
 * thresholds o copy.
 *
 * Variant:
 *   'card'    — burbuja de chat estilo welcome (con AssistantAvatar fuera)
 *   'inline'  — solo los dots + texto, para usar dentro de otra burbuja
 *
 * ACCESIBILIDAD (audit 2026-05-24):
 * El texto cambia en thresholds (3s, 10s, 25s, 60s). Cada cambio se
 * anuncia vía aria-live="polite" en el <span> de texto. El contenedor
 * NO lleva aria-label dinámico (eso causaba double-speak en algunos
 * AT y silencio total en otros — la conducta de label-changes en
 * regiones live no es estándar).
 */
import { streamingStatusText } from '../../utils/streamingStatus'

interface StreamingIndicatorProps {
  elapsedSeconds: number
  hasFirstToken?: boolean
  variant?: 'card' | 'inline'
}

export default function StreamingIndicator({
  elapsedSeconds,
  hasFirstToken = false,
  variant = 'card',
}: StreamingIndicatorProps) {
  const text = streamingStatusText(elapsedSeconds, hasFirstToken)

  if (variant === 'card') {
    return (
      <div
        style={{
          background: 'var(--ink-50)',
          border: '1px solid var(--ink-100)',
          borderRadius: 14,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          minHeight: 44,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: 'var(--mabel-600)',
              opacity: 0.7,
              animation: `streamingPulse 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{
            marginLeft: 8,
            fontSize: 12,
            color: 'var(--ink-500)',
            fontStyle: 'italic',
            transition: 'opacity var(--dur-base) var(--ease-out)',
          }}
        >
          {text}
        </span>
      </div>
    )
  }

  // inline — dots tipo bounce de Tailwind + texto a la derecha
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingTop: 10,
      }}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="animate-bounce"
          style={{
            width: 6,
            height: 6,
            background: 'var(--ink-400)',
            borderRadius: '50%',
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          marginLeft: 10,
          fontSize: 12,
          color: 'var(--ink-500)',
          fontStyle: 'italic',
        }}
      >
        {text}
      </span>
    </div>
  )
}
