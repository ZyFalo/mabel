/**
 * LlmStatusChip — Pildora compacta que muestra el estado del LLM en vivo.
 *
 * Capa 4 del UX de espera: el usuario siempre sabe si Mabel está warm
 * (verde, instantánea), cold (amber, va a tardar 60-90s al primer
 * mensaje), down (rojo, hay un problema) o unknown (gris claro,
 * cargando el primer health check).
 *
 * ACCESIBILIDAD (audit 2026-05-24):
 * El chip es un <button> tipo toggle con popover-on-click. Antes era
 * un <span> con tooltip vía `title` attribute — invisible en móvil
 * (sin hover) e invisible al teclado (los AT no leen `title` en Tab).
 * Ahora: Enter/Space abre el popover de detalle, Esc lo cierra, el
 * texto del popover lo lee cualquier AT.
 */
import { useEffect, useRef, useState } from 'react'
import type { LlmStatus } from '../../hooks/useLlmPrewarm'

interface LlmStatusChipProps {
  status: LlmStatus
}

const PRESETS: Record<
  LlmStatus,
  { label: string; bg: string; color: string; dot: string; detail: string }
> = {
  warm: {
    label: 'Mabel lista',
    bg: 'var(--success-50)',
    color: 'var(--success-700)',
    dot: 'var(--success-600)',
    detail: 'El modelo está warm — responderá en pocos segundos.',
  },
  cold: {
    label: 'Mabel despertando',
    bg: 'var(--warn-50)',
    color: 'var(--warn-700)',
    dot: 'var(--warn-600)',
    detail:
      'El modelo está en cold start (servidor en pausa por inactividad). El primer mensaje puede tardar 60-90 segundos. Los siguientes serán rápidos.',
  },
  down: {
    label: 'Mabel no disponible',
    bg: 'var(--danger-50)',
    color: 'var(--danger-700)',
    dot: 'var(--danger-600)',
    detail:
      'No se puede contactar el servicio del modelo. Intenta de nuevo en unos minutos.',
  },
  unknown: {
    label: 'Verificando…',
    bg: 'var(--ink-100)',
    color: 'var(--ink-500)',
    dot: 'var(--ink-400)',
    detail: 'Comprobando estado del modelo…',
  },
}

export default function LlmStatusChip({ status }: LlmStatusChipProps) {
  const p = PRESETS[status]
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // ESC cierra + click fuera cierra
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(t)
        && buttonRef.current && !buttonRef.current.contains(t)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${p.label}. ${p.detail} Pulsa para más detalle.`}
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
          border: 'none',
          cursor: 'pointer',
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
            animation:
              status === 'cold' || status === 'unknown'
                ? 'blink 1.6s ease-in-out infinite'
                : 'none',
          }}
        />
        {p.label}
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Detalle del estado de Mabel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 50,
            minWidth: 240,
            maxWidth: 320,
            background: '#fff',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            padding: '10px 12px',
            boxShadow: 'var(--shadow-md)',
            fontSize: 12.5,
            color: 'var(--ink-700)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: p.color }}>
            {p.label}
          </div>
          {p.detail}
        </div>
      )}
    </span>
  )
}
