import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { StudentOutletContext } from '../../types/studentOutlet'
import { Info, Smile, Moon, Target, MessageSquare, Sparkles, X } from 'lucide-react'

interface CheckinPayload {
  mood?: number | null
  sleep?: number | null
  focus?: string | null
  note?: string | null
  [k: string]: unknown
}

interface CheckinContextPopoverProps {
  /** Raw payload from `currentSession.checkin_payload`. Null/undefined = no check-in. */
  payload?: Record<string, unknown> | null
  /** When the check-in was completed. Null = user skipped or has it disabled. */
  completedAt?: string | null
  /** Session start time, used as fallback for "since" calculation. */
  startedAt?: string | null
}

const FOCUS_LABELS: Record<string, string> = {
  Academico: 'Académico',
  Social: 'Social',
  Familiar: 'Familiar',
  Salud: 'Salud',
  Economico: 'Económico',
  Otro: 'Otro',
}

const FOCUS_TONES: Record<string, string> = {
  Academico: 'var(--info-600)',
  Social: 'var(--mabel-600)',
  Familiar: 'var(--warn-600)',
  Salud: 'var(--success-600)',
  Economico: 'var(--ink-700)',
  Otro: 'var(--ink-500)',
}

function moodLabel(score: number | null | undefined): { label: string; color: string } {
  if (score == null) return { label: '—', color: 'var(--ink-500)' }
  if (score >= 8) return { label: 'Muy bien', color: 'var(--success-700)' }
  if (score >= 6) return { label: 'Bien', color: 'var(--success-600)' }
  if (score >= 4) return { label: 'Regular', color: 'var(--warn-700)' }
  if (score >= 2) return { label: 'Bajo', color: 'rgb(194,65,12)' }
  return { label: 'Muy bajo', color: 'var(--danger-700)' }
}

function timeSince(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'hace instantes'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d !== 1 ? 's' : ''}`
}

export default function CheckinContextPopover({
  payload,
  completedAt,
  startedAt,
}: CheckinContextPopoverProps) {
  const { openSettings } = useOutletContext<StudentOutletContext>()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Close on Escape or outside click.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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

  const cp = (payload ?? {}) as CheckinPayload
  const mood = typeof cp.mood === 'number' ? cp.mood : null
  const sleep = typeof cp.sleep === 'number' ? cp.sleep : null
  const focus = typeof cp.focus === 'string' ? cp.focus : null
  const note = typeof cp.note === 'string' ? cp.note.trim() : ''
  const hasCheckin = !!completedAt && Object.keys(cp).length > 0
  const since = timeSince(completedAt ?? startedAt)
  const moodMeta = moodLabel(mood)

  const rowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '20px 1fr auto',
    columnGap: 12,
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid var(--ink-100)',
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Contexto inicial de la sesión"
        aria-label="Ver contexto inicial de la sesión"
        aria-expanded={open}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: open ? 'var(--ink-100)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: open ? 'var(--ink-900)' : 'var(--ink-500)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'var(--ink-100)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent'
        }}
      >
        <Info size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Contexto inicial de la sesión"
          className="scale-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 320,
            background: '#fff',
            border: '1px solid var(--ink-200)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-lg)',
            padding: '14px 16px 12px',
            zIndex: 30,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--ink-900)',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '-0.005em',
              }}
            >
              <Sparkles size={14} color="var(--mabel-600)" />
              Contexto inicial
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink-400)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={14} />
            </button>
          </div>

          {hasCheckin ? (
            <>
              <div style={{ borderTop: '1px solid var(--ink-100)' }}>
                {/* Mood */}
                <div style={rowStyle}>
                  <Smile size={16} color="var(--ink-500)" />
                  <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Ánimo</span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: moodMeta.color,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {mood != null ? `${mood}/10` : '—'}
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-500)',
                        fontWeight: 500,
                        marginLeft: 6,
                      }}
                    >
                      {mood != null ? moodMeta.label : ''}
                    </span>
                  </span>
                </div>

                {/* Sleep */}
                <div style={rowStyle}>
                  <Moon size={16} color="var(--ink-500)" />
                  <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Sueño</span>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--ink-900)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {sleep != null ? `${sleep} h` : '—'}
                  </span>
                </div>

                {/* Focus */}
                <div style={rowStyle}>
                  <Target size={16} color="var(--ink-500)" />
                  <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Enfoque</span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: focus ? FOCUS_TONES[focus] ?? 'var(--ink-700)' : 'var(--ink-500)',
                      letterSpacing: '0.01em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {focus ? FOCUS_LABELS[focus] ?? focus : '—'}
                  </span>
                </div>

                {/* Note (only if present) */}
                {note && (
                  <div style={{ ...rowStyle, alignItems: 'flex-start', borderBottom: 'none' }}>
                    <MessageSquare size={16} color="var(--ink-500)" style={{ marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Nota</span>
                    <span
                      style={{
                        gridColumn: '2 / span 2',
                        fontSize: 12.5,
                        color: 'var(--ink-700)',
                        background: 'var(--ink-50)',
                        border: '1px solid var(--ink-100)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        lineHeight: 1.45,
                        marginTop: 6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {note}
                    </span>
                  </div>
                )}
              </div>

              {since && (
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-400)',
                    marginTop: 10,
                    marginBottom: 0,
                    textAlign: 'right',
                    fontStyle: 'italic',
                  }}
                >
                  Check-in completado {since}
                </p>
              )}
            </>
          ) : (
            <div style={{ paddingTop: 4 }}>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--ink-700)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Esta sesión inició sin check-in. Mabel responde sin contexto previo de ánimo, sueño o enfoque.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  openSettings('privacy')
                }}
                style={{
                  marginTop: 12,
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--mabel-700)',
                  background: 'var(--mabel-50)',
                  border: '1px solid var(--mabel-200)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-100)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-50)')}
              >
                Activar check-in en Ajustes
              </button>
              {since && (
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-400)',
                    marginTop: 10,
                    marginBottom: 0,
                    textAlign: 'right',
                    fontStyle: 'italic',
                  }}
                >
                  Sesión iniciada {since}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
