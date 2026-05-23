import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { StudentOutletContext } from '../../types/studentOutlet'
import {
  Info,
  Smile,
  Moon,
  Target,
  MessageSquare,
  Sparkles,
  X,
  Battery,
  Flame,
  UserCheck,
} from 'lucide-react'
import {
  FOCUS_LABEL_MAP,
  FOCUS_COLOR_MAP,
  normalizeFocus,
} from '../../constants/checkin'

// Catálogos compactos para mostrar las escalas 1-4 (energy, stress,
// loneliness) y la calidad de sueño categórica. Duplicados aquí para
// no tener que importar 4 constantes más cuando el popover solo
// necesita el label humano. Si los rangos cambiaran, actualizar
// también `constants/checkin.ts`.
const ENERGY_DISPLAY: Record<number, string> = {
  1: 'Sin batería',
  2: 'Baja',
  3: 'Suficiente',
  4: 'Con todo',
}
const STRESS_DISPLAY: Record<number, string> = {
  1: 'Nada',
  2: 'Un poco',
  3: 'Bastante',
  4: 'Muchísimo',
}
const LONELINESS_DISPLAY: Record<number, string> = {
  1: 'Muy sola/o',
  2: 'Algo sola/o',
  3: 'Acompañada/o',
  4: 'Muy acompañada/o',
}
const SLEEP_QUALITY_DISPLAY: Record<string, string> = {
  mal: 'Mal',
  regular: 'Regular',
  bien: 'Bien',
  muy_bien: 'Muy bien',
}

interface CheckinPayload {
  mood?: number | null
  energy?: number | null
  stress?: number | null
  sleep_quality?: string | null
  sleep?: number | null
  loneliness?: number | null
  // `focus` puede venir como string (formato legacy, pre 2026-05-23)
  // o array (formato actual con multi-select). `normalizeFocus`
  // unifica ambas formas.
  focus?: string | string[] | null
  focus_other?: string | null
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

// Mapas movidos a `constants/checkin.ts` — single source of truth
// compartida con CheckIn.tsx y SessionDetail.tsx.

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
  const energy = typeof cp.energy === 'number' ? cp.energy : null
  const stress = typeof cp.stress === 'number' ? cp.stress : null
  const sleepQuality = typeof cp.sleep_quality === 'string' ? cp.sleep_quality : null
  const sleep = typeof cp.sleep === 'number' ? cp.sleep : null
  const loneliness = typeof cp.loneliness === 'number' ? cp.loneliness : null
  const focusList = normalizeFocus(cp.focus)
  const focusOther = typeof cp.focus_other === 'string' ? cp.focus_other.trim() : ''
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

                {/* Energy (nuevo 2026-05-23). Solo render si presente
                    en el payload — sesiones legacy no lo tienen. */}
                {energy != null && (
                  <div style={rowStyle}>
                    <Battery size={16} color="var(--ink-500)" />
                    <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Energía</span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                      }}
                    >
                      {ENERGY_DISPLAY[energy] ?? '—'}
                    </span>
                  </div>
                )}

                {/* Stress (nuevo 2026-05-23) */}
                {stress != null && (
                  <div style={rowStyle}>
                    <Flame size={16} color="var(--ink-500)" />
                    <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Agobio</span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                      }}
                    >
                      {STRESS_DISPLAY[stress] ?? '—'}
                    </span>
                  </div>
                )}

                {/* Sleep — calidad (nueva) + horas (legacy o
                    complementario). Si solo hay horas, mostramos
                    el formato antiguo. */}
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
                    {sleepQuality
                      ? `${SLEEP_QUALITY_DISPLAY[sleepQuality] ?? sleepQuality}${sleep != null ? ` · ${sleep} h` : ''}`
                      : sleep != null
                        ? `${sleep} h`
                        : '—'}
                  </span>
                </div>

                {/* Loneliness / connection (nuevo 2026-05-23) */}
                {loneliness != null && (
                  <div style={rowStyle}>
                    <UserCheck size={16} color="var(--ink-500)" />
                    <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Compañía</span>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                      }}
                    >
                      {LONELINESS_DISPLAY[loneliness] ?? '—'}
                    </span>
                  </div>
                )}

                {/* Focus — multi-value: render as a pill list. Single
                    value mantiene el look minimal de tag uppercase para
                    no romper la compatibilidad visual con sesiones
                    antiguas que solo tienen un foco. */}
                <div style={rowStyle}>
                  <Target size={16} color="var(--ink-500)" />
                  <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>Enfoque</span>
                  {focusList.length === 0 ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'var(--ink-500)',
                        letterSpacing: '0.01em',
                        textTransform: 'uppercase',
                      }}
                    >
                      —
                    </span>
                  ) : focusList.length === 1 ? (
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: FOCUS_COLOR_MAP[focusList[0]] ?? 'var(--ink-700)',
                        letterSpacing: '0.01em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {FOCUS_LABEL_MAP[focusList[0]] ?? focusList[0]}
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        flexWrap: 'wrap',
                        gap: 4,
                        justifyContent: 'flex-end',
                        maxWidth: 200,
                      }}
                    >
                      {focusList.map((f) => (
                        <span
                          key={f}
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: FOCUS_COLOR_MAP[f] ?? 'var(--ink-700)',
                            background: 'var(--ink-50)',
                            border: '1px solid var(--ink-200)',
                            borderRadius: 6,
                            padding: '2px 7px',
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {FOCUS_LABEL_MAP[f] ?? f}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {/* Texto libre cuando el foco "Otro" fue seleccionado y
                    el estudiante completó el mini-input. Lo mostramos
                    en línea separada para no romper el layout de la
                    fila de focos cuando el contenido es largo. */}
                {focusList.includes('Otro') && focusOther && (
                  <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                    <Target size={16} color="var(--ink-400)" style={{ marginTop: 2 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Otro foco</span>
                    <span
                      style={{
                        gridColumn: '2 / span 2',
                        fontSize: 12,
                        color: 'var(--ink-700)',
                        background: 'var(--ink-50)',
                        border: '1px solid var(--ink-100)',
                        borderRadius: 8,
                        padding: '6px 9px',
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {focusOther}
                    </span>
                  </div>
                )}

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
