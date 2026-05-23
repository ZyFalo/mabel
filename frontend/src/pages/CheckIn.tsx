import { useState, type CSSProperties } from 'react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowRight, Pencil } from 'lucide-react'
import SosButton from '../components/ui/SosButton'
import UmbAvatar from '../components/ui/UmbAvatar'
import type { StudentOutletContext } from '../types/studentOutlet'
import apiClient from '../api/client'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'
import {
  FOCUS_OPTIONS,
  MOOD_LEVELS,
  STRESS_LEVELS,
  ENERGY_LEVELS,
  LONELINESS_LEVELS,
  SLEEP_QUALITY_LEVELS,
  type MoodLevel,
  type SegmentedLevel,
  type SleepQualityLevel,
} from '../constants/checkin'

/**
 * Free-text máximo en el campo "Otro" del foco. El agente recomendó
 * 80 chars para que sea ágil de leer cuando alimenta el system prompt.
 */
const FOCUS_OTHER_MAX = 80

export default function CheckIn() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const addToast = useToastStore((s) => s.addToast)
  const createSession = useChatStore((s) => s.createSession)
  // Modo "new" (draft): no hay sesión todavía. Al submit creamos la
  // sesión + check-in atómicamente vía POST /sessions con
  // `checkin_payload`. "Saltar todo" vuelve al Home sin crear nada,
  // resolviendo el problema de las sesiones huérfanas creadas por
  // simple navegación al formulario.
  const isDraft = !id
  // Forward the pendingMessage (if any) so Chat.tsx can send it as the
  // user's first message after the check-in is recorded.
  const forwardState = (location.state as { pendingMessage?: string } | null)
    ?.pendingMessage
    ? { pendingMessage: (location.state as { pendingMessage: string }).pendingMessage }
    : undefined

  // ---------- State ----------
  // TODOS los campos son opcionales. Click sobre la opción seleccionada
  // la des-selecciona (`toggleSingle` helper).
  const [mood, setMood] = useState<MoodLevel | null>(null)
  const [energy, setEnergy] = useState<SegmentedLevel | null>(null)
  const [stress, setStress] = useState<SegmentedLevel | null>(null)
  const [sleepQuality, setSleepQuality] = useState<SleepQualityLevel | null>(null)
  const [sleepHoursOpen, setSleepHoursOpen] = useState(false)
  const [sleepHours, setSleepHours] = useState<string>('')
  const [loneliness, setLoneliness] = useState<SegmentedLevel | null>(null)
  const [focus, setFocus] = useState<string[]>([])
  const [focusOther, setFocusOther] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ---------- Toggle helpers (deselect on click-when-selected) ----------
  function toggleMood(lvl: MoodLevel) {
    setMood((prev) => (prev?.value === lvl.value ? null : lvl))
  }
  function toggleEnergy(lvl: SegmentedLevel) {
    setEnergy((prev) => (prev?.value === lvl.value ? null : lvl))
  }
  function toggleStress(lvl: SegmentedLevel) {
    setStress((prev) => (prev?.value === lvl.value ? null : lvl))
  }
  function toggleSleepQuality(lvl: SleepQualityLevel) {
    setSleepQuality((prev) => (prev?.value === lvl.value ? null : lvl))
  }
  function toggleLoneliness(lvl: SegmentedLevel) {
    setLoneliness((prev) => (prev?.value === lvl.value ? null : lvl))
  }
  function toggleFocus(value: string) {
    setFocus((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
    // Si quitan "Otro", limpiar también el texto libre.
    if (value === 'Otro' && focus.includes('Otro')) {
      setFocusOther('')
    }
  }

  // ---------- Submit ----------
  /**
   * Construye el payload solo con los campos efectivamente llenados.
   * Si el estudiante no marcó NADA, omitimos el PATCH y entramos al
   * chat directo (equivalente a "Omitir") — evitamos persistir un
   * `checkin_payload: {}` que solo ensuciaría las métricas.
   */
  function buildPayload(): Record<string, unknown> {
    const p: Record<string, unknown> = {}
    if (mood) p.mood = mood.value
    if (energy) p.energy = energy.value
    if (stress) p.stress = stress.value
    if (sleepQuality) p.sleep_quality = sleepQuality.value
    if (sleepHoursOpen) {
      const parsed = parseFloat(sleepHours)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 24) {
        p.sleep = parsed
      }
    }
    if (loneliness) p.loneliness = loneliness.value
    if (focus.length > 0) {
      p.focus = focus
      if (focus.includes('Otro') && focusOther.trim()) {
        p.focus_other = focusOther.trim()
      }
    }
    if (note.trim()) p.note = note.trim()
    return p
  }

  async function handleSubmit() {
    const payload = buildPayload()
    if (Object.keys(payload).length === 0) {
      // Nada llenado → equivalente a "Saltar todo".
      handleSkip()
      return
    }
    setSubmitting(true)
    try {
      if (isDraft) {
        // Lazy: creamos la sesión + check-in atómicamente. El backend
        // persiste el payload y marca `checkin_completed_at` en la
        // misma transacción de POST /sessions, evitando el window
        // donde una sesión quedaría sin check-in si el segundo paso
        // fallara. `previous_session_closed` cierra cualquier sesión
        // activa anterior (que el front muestra como toast).
        const session = await createSession({ checkinPayload: payload })
        if (session.previous_session_closed) {
          addToast({
            type: 'info',
            message: 'Sesión anterior finalizada automáticamente',
          })
        }
        navigate(`/session/${session.id}/chat`, { state: forwardState })
      } else {
        // Modo edit (legacy / sesiones huérfanas pre-2026-05-23 con
        // checkin_opt_in=true sin completar). PATCH normal.
        await apiClient.patch(`/sessions/${id}`, { checkin_payload: payload })
        navigate(`/session/${id}/chat`, { state: forwardState })
      }
    } catch {
      addToast({
        type: 'error',
        message: 'No pudimos guardar el check-in. Intenta de nuevo.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function handleSkip() {
    if (isDraft) {
      // Sin sesión que abandonar — volvemos al Home directamente. El
      // estudiante decidió no llenar el check-in y tampoco escribir
      // mensaje aún; no se crea nada.
      navigate('/home')
    } else {
      // Sesión legacy ya existente sin check-in → entrar al chat
      // sin completarlo (preserva comportamiento previo).
      navigate(`/session/${id}/chat`, { state: forwardState })
    }
  }

  // ---------- Render ----------
  return (
    <div
      className="fade-in"
      style={{
        minHeight: '100%',
        background: 'var(--ink-50)',
        padding: '40px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <SosButton variant="floating" onClick={openCrisis} />

      <div style={{ width: '100%', maxWidth: 580 }}>
        {/* Hero header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <UmbAvatar size={56} style={{ margin: '0 auto 14px' }} />
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--ink-900)',
              margin: '0 0 8px',
              letterSpacing: '-0.015em',
              lineHeight: 1.2,
              fontFamily: 'var(--font-sans)',
            }}
          >
            ¿Cómo estás llegando hoy?
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-500)',
              margin: 0,
              lineHeight: 1.55,
              maxWidth: 460,
              marginInline: 'auto',
            }}
          >
            Siete preguntas suaves para que Mabel arranque entendiendo cómo
            estás. Ninguna es obligatoria.
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--ink-200)',
            borderRadius: 16,
            padding: '24px 24px 20px',
            boxShadow: '0 4px 14px -6px rgba(26, 17, 16, 0.08)',
          }}
        >
          {/* 1. Mood — 5 iconos */}
          <Section
            label="¿Cómo te sientes ahora mismo?"
            helper={mood ? undefined : 'Toca la opción que más te represente.'}
          >
            <div
              role="radiogroup"
              aria-label="Estado de ánimo"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 10,
              }}
            >
              {MOOD_LEVELS.map((lvl) => {
                const selected = mood?.value === lvl.value
                const Icon = lvl.icon
                return (
                  <button
                    key={lvl.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={lvl.label}
                    onClick={() => toggleMood(lvl)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '14px 4px 10px',
                      borderRadius: 12,
                      border: `2px solid ${selected ? 'var(--mabel-600)' : 'var(--ink-200)'}`,
                      background: selected ? 'var(--mabel-50, #FDF2F2)' : '#fff',
                      cursor: 'pointer',
                      transition:
                        'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, color 0.15s ease',
                      transform: selected ? 'translateY(-2px)' : 'translateY(0)',
                      fontFamily: 'var(--font-sans)',
                      color: selected ? 'var(--mabel-600)' : 'var(--ink-400)',
                    }}
                    onMouseEnter={(e) => {
                      if (selected) return
                      e.currentTarget.style.borderColor = 'var(--mabel-600)'
                      e.currentTarget.style.color = 'var(--mabel-600)'
                    }}
                    onMouseLeave={(e) => {
                      if (selected) return
                      e.currentTarget.style.borderColor = 'var(--ink-200)'
                      e.currentTarget.style.color = 'var(--ink-400)'
                    }}
                  >
                    <Icon size={28} strokeWidth={selected ? 2.2 : 1.8} aria-hidden="true" />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: selected ? 600 : 500,
                        color: selected ? 'var(--mabel-700)' : 'var(--ink-500)',
                        lineHeight: 1.2,
                        textAlign: 'center',
                      }}
                    >
                      {lvl.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* 2. Energía */}
          <Section label="¿Con qué energía amaneciste para lo que tienes hoy?">
            <Segmented
              options={ENERGY_LEVELS}
              value={energy}
              onToggle={toggleEnergy}
              ariaLabel="Energía"
            />
          </Section>

          {/* 3. Estrés */}
          <Section label="¿Qué tanto te has sentido abrumada/o hoy?">
            <Segmented
              options={STRESS_LEVELS}
              value={stress}
              onToggle={toggleStress}
              ariaLabel="Estrés percibido"
            />
          </Section>

          {/* 4. Sueño calidad + horas opcional plegable */}
          <Section label="¿Cómo dormiste anoche?">
            <Segmented
              options={SLEEP_QUALITY_LEVELS}
              value={sleepQuality}
              onToggle={toggleSleepQuality}
              ariaLabel="Calidad de sueño"
            />
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setSleepHoursOpen((v) => !v)
                  if (sleepHoursOpen) setSleepHours('')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--mabel-700)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '6px 0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <Pencil size={12} />
                {sleepHoursOpen ? 'Quitar horas exactas' : 'También puedo decir las horas'}
              </button>
              {sleepHoursOpen && (
                <div className="fade-in" style={{ marginTop: 6 }}>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    placeholder="Ej: 6.5"
                    autoFocus
                    style={{
                      width: 120,
                      padding: '8px 12px',
                      border: '1px solid var(--ink-300)',
                      borderRadius: 8,
                      fontSize: 14,
                      color: 'var(--ink-900)',
                      fontFamily: 'var(--font-sans)',
                      outline: 'none',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--mabel-600)')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ink-300)')}
                  />
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink-500)' }}>horas</span>
                </div>
              )}
            </div>
          </Section>

          {/* 5. Soledad / conexión */}
          <Section label="Hoy, ¿qué tan acompañada/o te sientes?">
            <Segmented
              options={LONELINESS_LEVELS}
              value={loneliness}
              onToggle={toggleLoneliness}
              ariaLabel="Conexión social"
            />
          </Section>

          {/* 6. Focos (multi, ampliado) */}
          <Section
            label="¿De dónde viene lo que sientes?"
            helper={
              focus.length === 0
                ? 'Puedes elegir más de uno'
                : `${focus.length} seleccionado${focus.length === 1 ? '' : 's'}`
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FOCUS_OPTIONS.map((opt) => {
                const selected = focus.includes(opt.value)
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleFocus(opt.value)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: `1.5px solid ${selected ? 'var(--mabel-600)' : 'var(--ink-200)'}`,
                      background: selected ? 'var(--mabel-50, #FDF2F2)' : '#fff',
                      color: selected ? 'var(--mabel-700)' : 'var(--ink-700)',
                      fontSize: 13,
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.borderColor = 'var(--mabel-600)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.borderColor = 'var(--ink-200)'
                    }}
                  >
                    <Icon
                      size={14}
                      style={{ color: selected ? 'var(--mabel-600)' : opt.color }}
                      aria-hidden="true"
                    />
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {/* Mini-input cuando "Otro" está activo */}
            {focus.includes('Otro') && (
              <div className="fade-in" style={{ marginTop: 10 }}>
                <input
                  type="text"
                  value={focusOther}
                  onChange={(e) => setFocusOther(e.target.value.slice(0, FOCUS_OTHER_MAX))}
                  placeholder="¿Quieres contarme brevemente?"
                  maxLength={FOCUS_OTHER_MAX}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--ink-300)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--ink-900)',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--mabel-600)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ink-300)')}
                />
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--ink-400)',
                    textAlign: 'right',
                    margin: '2px 2px 0',
                  }}
                >
                  {focusOther.length}/{FOCUS_OTHER_MAX}
                </p>
              </div>
            )}
          </Section>

          {/* 7. Notas */}
          <Section label="¿Algo más que quieras compartir?" isLast>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Lo que tengas en mente, sin filtros…"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--ink-300)',
                borderRadius: 10,
                fontSize: 14,
                color: 'var(--ink-900)',
                fontFamily: 'var(--font-sans)',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
                transition: 'border-color 0.15s ease',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--mabel-600)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ink-300)')}
            />
            <p
              style={{
                fontSize: 11,
                color: 'var(--ink-400)',
                textAlign: 'right',
                margin: '4px 2px 0',
              }}
            >
              {note.length}/500
            </p>
          </Section>
        </div>

        {/* Actions — `marginBottom` actúa como spacer inferior. Lo
            ponemos aquí (en lugar de padding-bottom del outer) porque
            el `<main>` del StudentLayout es `flex-1 overflow-y-auto`
            y al hacer scroll el padding-bottom del child a veces no
            se materializa hasta el final del viewport. Margin en el
            último flex item siempre cuenta como contenido scrolleable.
            Suma `env(safe-area-inset-bottom)` para iOS notch. */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 20,
            marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-500)',
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              padding: '10px 4px',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Saltar todo
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 22px',
              borderRadius: 12,
              border: 'none',
              background: submitting ? 'var(--ink-300)' : 'var(--mabel-600)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease, transform 0.15s ease',
              boxShadow: submitting ? 'none' : 'var(--shadow-brand)',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.background = 'var(--mabel-700, #8B1612)'
            }}
            onMouseLeave={(e) => {
              if (!submitting) e.currentTarget.style.background = 'var(--mabel-600)'
            }}
          >
            {submitting ? 'Guardando…' : 'Continuar'}
            {!submitting && <ArrowRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Helpers de presentación ----------

function Section({
  label,
  helper,
  isLast,
  children,
}: {
  label: string
  helper?: string
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        marginBottom: isLast ? 0 : 22,
        paddingBottom: isLast ? 0 : 22,
        borderBottom: isLast ? 'none' : '1px solid var(--ink-100)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
          gap: 8,
        }}
      >
        <label
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-900)',
            lineHeight: 1.4,
          }}
        >
          {label}
        </label>
        {helper && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-400)',
              fontWeight: 500,
              flexShrink: 0,
              textAlign: 'right',
            }}
          >
            {helper}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * Segmented selector de 4 puntos (también funciona para sleep quality).
 * Click sobre la opción seleccionada → la deselecciona.
 */
function Segmented<T extends { value: string | number; label: string }>({
  options,
  value,
  onToggle,
  ariaLabel,
}: {
  options: T[]
  value: T | null
  onToggle: (opt: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((opt) => {
        const selected = value?.value === opt.value
        const style: CSSProperties = {
          padding: '10px 6px',
          borderRadius: 10,
          border: `1.5px solid ${selected ? 'var(--mabel-600)' : 'var(--ink-200)'}`,
          background: selected ? 'var(--mabel-50, #FDF2F2)' : '#fff',
          color: selected ? 'var(--mabel-700)' : 'var(--ink-600)',
          fontSize: 12.5,
          fontWeight: selected ? 600 : 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: 'var(--font-sans)',
          textAlign: 'center',
          lineHeight: 1.25,
        }
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onToggle(opt)}
            style={style}
            onMouseEnter={(e) => {
              if (!selected) e.currentTarget.style.borderColor = 'var(--mabel-600)'
            }}
            onMouseLeave={(e) => {
              if (!selected) e.currentTarget.style.borderColor = 'var(--ink-200)'
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
