/**
 * LlmStatusChip — Pildora compacta que muestra el estado del LLM en vivo.
 *
 * Capa 4 del UX de espera: el usuario siempre sabe si Mabel está warm
 * (verde, instantánea), cold (amber, va a tardar 60-90s al primer
 * mensaje), down (rojo, hay un problema) o unknown (gris claro,
 * cargando el primer health check).
 *
 * Se actualiza por polling cada 30s desde useLlmPrewarm({ pollIntervalMs }).
 */
import type { LlmStatus } from '../../hooks/useLlmPrewarm'

interface LlmStatusChipProps {
  status: LlmStatus
}

const PRESETS: Record<
  LlmStatus,
  { label: string; bg: string; color: string; dot: string; title: string }
> = {
  warm: {
    label: 'Mabel lista',
    bg: 'var(--success-50)',
    color: 'var(--success-700)',
    dot: 'var(--success-600)',
    title: 'El modelo está warm — responderá en pocos segundos.',
  },
  cold: {
    label: 'Mabel despertando',
    bg: 'var(--warn-50)',
    color: 'var(--warn-700)',
    dot: 'var(--warn-600)',
    title:
      'El modelo está en cold start (servidor en pausa por inactividad). El primer mensaje puede tardar 60-90 s.',
  },
  down: {
    label: 'Mabel no disponible',
    bg: 'var(--danger-50)',
    color: 'var(--danger-700)',
    dot: 'var(--danger-600)',
    title:
      'No se puede contactar el servicio del modelo. Intenta de nuevo en unos minutos.',
  },
  unknown: {
    label: 'Verificando…',
    bg: 'var(--ink-100)',
    color: 'var(--ink-500)',
    dot: 'var(--ink-400)',
    title: 'Comprobando estado del modelo…',
  },
}

export default function LlmStatusChip({ status }: LlmStatusChipProps) {
  const p = PRESETS[status]
  return (
    <span
      title={p.title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        background: p.bg,
        color: p.color,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition:
          'background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: p.dot,
          // Pulse sutil cuando está cold (algo está pasando) o
          // unknown (cargando); estático cuando está warm/down.
          animation:
            status === 'cold' || status === 'unknown'
              ? 'blink 1.6s ease-in-out infinite'
              : 'none',
        }}
      />
      {p.label}
    </span>
  )
}
