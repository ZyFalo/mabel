import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Type, MonitorSmartphone, Bot, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import Toggle from '../components/ui/Toggle'
import Segmented from '../components/ui/Segmented'
import NativeSelect from '../components/ui/NativeSelect'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import AuthShell from '../components/auth/AuthShell'

const STEPS = ['Privacidad', 'Accesibilidad', 'Voz']

interface FormState {
  save_history: boolean
  checkin_enabled: boolean
  contrast: boolean
  font_size: string
  subtitles: boolean
  tts_voice: string
  preferred_chat_mode: 'chat' | 'avatar'
}

const DEFAULT_STATE: FormState = {
  save_history: false,
  checkin_enabled: true,
  contrast: false,
  font_size: 'normal',
  subtitles: true,
  tts_voice: '',
  preferred_chat_mode: 'chat',
}

export default function Onboarding() {
  const navigate = useNavigate()
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences)
  const addToast = useToastStore((s) => s.addToast)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updatePreferences({
        save_history: form.save_history,
        checkin_enabled: form.checkin_enabled,
        accessibility: {
          contrast: form.contrast,
          font_size: form.font_size,
          subtitles: form.subtitles,
        },
        tts_voice: form.tts_voice || null,
        preferred_chat_mode: form.preferred_chat_mode,
      })
      addToast({ type: 'success', message: 'Preferencias guardadas' })
      navigate('/home')
    } catch {
      addToast({ type: 'error', message: 'Error al guardar preferencias' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    setSaving(true)
    try {
      await updatePreferences({})
      navigate('/home')
    } catch {
      addToast({ type: 'error', message: 'Error al guardar preferencias' })
    } finally {
      setSaving(false)
    }
  }

  const progressPct = ((step + 1) / STEPS.length) * 100

  return (
    <AuthShell
      wide
      side={
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 24,
              backdropFilter: 'blur(6px)',
            }}
          >
            <Sparkles size={13} />
            Configuración inicial
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              margin: '0 0 14px',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Personaliza tu<br />experiencia.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
            Ajusta privacidad, accesibilidad y voz a la medida. Podrás cambiar todo después desde
            Ajustes.
          </p>
        </div>
      }
    >
      <div>
        {/* Progress bar */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: 'var(--ink-500)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Paso {step + 1} de {STEPS.length}
            </span>
            <span style={{ fontSize: 12, color: 'var(--mabel-600)', fontWeight: 600 }}>
              {STEPS[step]}
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'var(--ink-200)',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'var(--mabel-600)',
                transition: 'width var(--dur-base) var(--ease-out)',
              }}
            />
          </div>
        </div>

        {/* Step card */}
        <div
          key={step}
          className="fade-in"
          style={{
            background: '#fff',
            border: '1px solid var(--ink-200)',
            borderRadius: 18,
            padding: '28px 28px 22px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Step 1: Privacidad */}
          {step === 0 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: '0 0 6px',
                  color: 'var(--ink-900)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.015em',
                }}
              >
                Privacidad
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 22px', lineHeight: 1.55 }}>
                Configura cómo Mabel IA maneja tu información.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
                      Guardar historial de conversaciones
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Si está desactivado, los mensajes no se guardan después de cerrar la sesión.
                    </p>
                  </div>
                  <Toggle
                    checked={form.save_history}
                    onChange={(v) => update('save_history', v)}
                    label="Guardar historial"
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
                      Check-in emocional al inicio
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Te preguntaremos cómo te sientes antes de iniciar la conversación.
                    </p>
                  </div>
                  <Toggle
                    checked={form.checkin_enabled}
                    onChange={(v) => update('checkin_enabled', v)}
                    label="Check-in"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Accesibilidad */}
          {step === 1 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: '0 0 6px',
                  color: 'var(--ink-900)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.015em',
                }}
              >
                Accesibilidad
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 22px', lineHeight: 1.55 }}>
                Ajusta la interfaz a tus necesidades.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
                      Alto contraste
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Aumenta el contraste de colores para mejor legibilidad.
                    </p>
                  </div>
                  <Toggle
                    checked={form.contrast}
                    onChange={(v) => update('contrast', v)}
                    label="Alto contraste"
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink-900)',
                      margin: '0 0 10px',
                    }}
                  >
                    Tamaño de fuente
                  </p>
                  <Segmented
                    ariaLabel="Tamaño de fuente"
                    value={form.font_size}
                    onChange={(v) => update('font_size', v)}
                    options={[
                      { value: 'small', label: 'Pequeña', icon: Type },
                      { value: 'normal', label: 'Normal', icon: Type },
                      { value: 'large', label: 'Grande', icon: Type },
                    ]}
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
                      Subtítulos TTS
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Resalta el texto mientras Mabel habla.
                    </p>
                  </div>
                  <Toggle
                    checked={form.subtitles}
                    onChange={(v) => update('subtitles', v)}
                    label="Subtítulos"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Voz */}
          {step === 2 && (
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: '0 0 6px',
                  color: 'var(--ink-900)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.015em',
                }}
              >
                Voz
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 22px', lineHeight: 1.55 }}>
                Configura cómo suena Mabel IA.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink-900)',
                      margin: '0 0 10px',
                    }}
                  >
                    Voz del asistente
                  </p>
                  <NativeSelect
                    value={form.tts_voice}
                    onChange={(v) => update('tts_voice', v)}
                    ariaLabel="Voz del asistente"
                  >
                    <option value="">Por defecto</option>
                    <option value="es-female-1">Femenina 1</option>
                    <option value="es-female-2">Femenina 2</option>
                    <option value="es-male-1">Masculina 1</option>
                  </NativeSelect>
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink-900)',
                      margin: '0 0 10px',
                    }}
                  >
                    Modo de interacción
                  </p>
                  <Segmented
                    ariaLabel="Modo de interacción"
                    value={form.preferred_chat_mode}
                    onChange={(v) => update('preferred_chat_mode', v)}
                    options={[
                      { value: 'chat', label: 'Chat clásico', icon: MonitorSmartphone },
                      { value: 'avatar', label: 'Avatar 3D', icon: Bot },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 20,
          }}
        >
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '11px 18px',
                background: 'transparent',
                color: 'var(--ink-600)',
                border: 'none',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <ArrowLeft size={14} />
              Anterior
            </button>
          ) : (
            <div style={{ width: 92 }} />
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSkip}
            disabled={saving}
            style={{
              padding: '11px 14px',
              background: 'transparent',
              color: 'var(--ink-500)',
              border: 'none',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Omitir
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                background: 'var(--mabel-600)',
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: 'var(--shadow-brand)',
                transition: 'background var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
            >
              Continuar
              <ArrowRight size={15} strokeWidth={2.25} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                background: 'var(--mabel-600)',
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)',
                boxShadow: 'var(--shadow-brand)',
                opacity: saving ? 0.7 : 1,
                transition: 'background var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = 'var(--mabel-700)'
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = 'var(--mabel-600)'
              }}
            >
              {saving ? 'Guardando...' : 'Comenzar'}
              {!saving && <ArrowRight size={15} strokeWidth={2.25} />}
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  )
}
