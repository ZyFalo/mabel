import { useEffect, useState } from 'react'
import { Heart, Phone, X } from 'lucide-react'
import apiClient from '../../api/client'

interface HotlineEntry {
  name: string
  number: string
}

interface SosPanelProps {
  open: boolean
  trigger: 'manual' | 'auto'
  sessionId?: string
  onClose: () => void
}

// PRESERVED: fallback hotlines when /sos endpoint fails or returns empty.
const FALLBACK_NUMBERS: HotlineEntry[] = [
  { name: 'Linea 106 ICBF', number: '018000112440' },
  { name: 'Linea 141 Linea de la Vida', number: '018000113113' },
]

/**
 * CrisisOverlay (a.k.a. SosPanel) — reskin per `crisis.jsx` prototype.
 *
 * Functional contract is preserved verbatim:
 * - Triggers: SosFab (manual), sidebar SOS button (manual), Chat.tsx
 *   riskDetected (auto). All three set `open=true` from the parent.
 * - On open: GET /system-config/sos to fetch hotlines (falls back to
 *   hardcoded list on failure/empty).
 * - On open: POST /safety-events with event_type=redirect_shown,
 *   payload.trigger, payload.lines_shown, and session_id — same payload
 *   shape as before.
 * - Backdrop click, X button and "Continuar con Mabel" all call onClose
 *   without ending the session.
 */
export default function SosPanel({ open, trigger, sessionId, onClose }: SosPanelProps) {
  const [numbers, setNumbers] = useState<HotlineEntry[]>(FALLBACK_NUMBERS)
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (!open) return
    apiClient
      .get('/system-config/sos')
      .then((res) => {
        if (res.data.hotline_numbers?.length) {
          setNumbers(res.data.hotline_numbers)
        }
      })
      .catch(() => {})

    // PRESERVED: Register redirect_shown safety event.
    if (!registered) {
      apiClient
        .post('/safety-events', {
          event_type: 'redirect_shown',
          payload: {
            trigger,
            lines_shown: numbers.map((n) => n.name),
          },
          session_id: sessionId || null,
        })
        .catch(() => {})
      setRegistered(true)
    }
  }, [open, trigger, sessionId, registered, numbers])

  if (!open) return null

  return (
    <div
      className="fade-in"
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(26,17,16,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crisis-overlay-title"
        style={{
          background: '#fff',
          width: 'min(100%, 720px)',
          maxHeight: '92%',
          borderRadius: 18,
          overflow: 'auto',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--ink-200)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Hero band */}
        <div
          style={{
            background: 'var(--mabel-50)',
            padding: '32px 32px 28px',
            textAlign: 'center',
            borderBottom: '1px solid var(--mabel-100)',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid var(--ink-200)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-600)',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.8)'
            }}
          >
            <X size={16} />
          </button>

          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              background: '#fff',
              color: 'var(--mabel-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Heart size={24} />
          </div>

          <h2
            id="crisis-overlay-title"
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: '0 0 8px',
              color: 'var(--ink-900)',
              letterSpacing: '-0.015em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Estamos aqui contigo
          </h2>

          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-600)',
              margin: '0 auto',
              maxWidth: 420,
              lineHeight: 1.55,
            }}
          >
            Si estas pasando por un momento dificil, no estas solo/a. Hay personas
            capacitadas listas para ayudarte ahora mismo.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px 28px' }}>
          {/* Hotline cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {numbers.map((line) => {
              const telHref = `tel:${line.number.replace(/\D/g, '')}`
              return (
                <div
                  key={`${line.name}-${line.number}`}
                  style={{
                    background: '#fff',
                    border: '1px solid var(--ink-200)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: 'var(--mabel-50)',
                      color: 'var(--mabel-600)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Phone size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--ink-900)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {line.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ink-500)',
                        marginTop: 2,
                      }}
                    >
                      {line.number}
                    </div>
                  </div>
                  <a
                    href={telHref}
                    aria-label={`Llamar a ${line.name}`}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--mabel-600)',
                      color: '#fff',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: 'none',
                      transition: 'background var(--dur-fast) var(--ease-out)',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--mabel-700)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--mabel-600)'
                    }}
                  >
                    Llamar
                  </a>
                </div>
              )
            })}
          </div>

          {/* Continuar con Mabel — outline secondary action */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--ink-100)',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 22px',
                background: 'transparent',
                color: 'var(--mabel-600)',
                border: '1px solid var(--mabel-600)',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'background var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--mabel-50)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Continuar con Mabel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
