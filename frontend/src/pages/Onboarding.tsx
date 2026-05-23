import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Type, MonitorSmartphone, Bot, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import Toggle from '../components/ui/Toggle'
import Segmented from '../components/ui/Segmented'
import NativeSelect from '../components/ui/NativeSelect'
import InfoHint from '../components/admin/InfoHint'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import AuthShell from '../components/auth/AuthShell'

// Small helper to render an option title with an inline info tooltip.
// Keeps the JSX of each step readable by collapsing the `<p>title</p> +
// <InfoHint />` pattern into one component.
function OptionLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
        {title}
      </p>
      <InfoHint text={hint} />
    </div>
  )
}

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
  const { hasPreferences, loadPreferences, loading: prefsLoading } = usePreferencesStore()
  const addToast = useToastStore((s) => s.addToast)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)

  // Bounce users that already completed onboarding back to /home. The
  // route is reachable via direct URL / browser back-button even when
  // they have a preferences row, and `handleSave` would otherwise PUT
  // DEFAULT_STATE (with all the locked-disabled fields) and silently
  // overwrite whatever they had configured before. The redirect is a
  // belt-and-suspenders complement to OnboardingGuard, which only
  // covers the *other* student routes after this PR moved /onboarding
  // out of StudentLayout.
  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  if (prefsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (hasPreferences) {
    return <Navigate to="/home" replace />
  }

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

  // Skip the CURRENT step — does not jump straight to /home. Advances
  // by one. Only on the final step does it complete onboarding (PUTs
  // whatever the form has so far, including any defaults the user
  // didn't explicitly set). Earlier behavior was "Omitir = skip
  // entire onboarding"; users complained that pressing it on step 1
  // bypassed the other two pages they wanted to see.
  async function handleSkip() {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
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
      compactHero
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
                    <OptionLabel
                      title="Guardar historial de conversaciones"
                      hint="Si está activado, tus mensajes quedan guardados de forma cifrada y puedes retomar la conversación más tarde. Si lo desactivas, cada sesión empieza en blanco y nada se persiste al cerrarla. También afecta a la investigación: los empathy ratings necesitan que el historial esté guardado."
                    />
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
                    <OptionLabel
                      title="Check-in emocional al inicio"
                      hint="Antes de empezar a hablar, Mabel te hará 3 preguntas rápidas (ánimo, sueño, foco). Eso le permite ajustar su tono y prioridades durante la conversación. Si lo desactivas, entras directo al chat sin preguntas previas."
                    />
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

              {/*
                TODO: pendiente modelo 2D
                Los 3 controles de accesibilidad (alto contraste, tamaño
                fuente, subtítulos TTS) hoy guardan flags en BD pero NADIE
                los aplica al DOM (no hay clase `.a11y-contrast` ni handler
                de font-size en `<html>`, y los subtítulos dependen del
                modelo de voz que aún no existe). Se dejan visibles pero
                disabled para mantener la promesa visual del producto.
                Detalle del trabajo a hacer cuando llegue el modelo 2D:
                ver memoria `onboarding-pending-when-voice-avatar-lands.md`.
              */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    opacity: 0.55,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <OptionLabel
                      title="Alto contraste"
                      hint="Refuerza el contraste entre texto y fondo en toda la interfaz para facilitar la lectura a personas con baja visión. Pendiente: se conectará al DOM cuando se integre el modelo 2D animado."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Aumenta el contraste de colores para mejor legibilidad.
                    </p>
                  </div>
                  <Toggle
                    checked={form.contrast}
                    onChange={(v) => update('contrast', v)}
                    label="Alto contraste"
                    disabled
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div style={{ opacity: 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                        margin: 0,
                      }}
                    >
                      Tamaño de fuente
                    </p>
                    <InfoHint text="Cambia el tamaño base del texto en toda la app (botones, mensajes, formularios). Pendiente: se conectará al DOM cuando se integre el modelo 2D animado." />
                  </div>
                  <Segmented
                    ariaLabel="Tamaño de fuente"
                    value={form.font_size}
                    onChange={(v) => update('font_size', v)}
                    options={[
                      { value: 'small', label: 'Pequeña', icon: Type, disabled: true },
                      { value: 'normal', label: 'Normal', icon: Type, disabled: true },
                      { value: 'large', label: 'Grande', icon: Type, disabled: true },
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
                    opacity: 0.55,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <OptionLabel
                      title="Subtítulos TTS"
                      hint="Cuando Mabel hable en voz alta, resalta en su burbuja la palabra que está pronunciando — útil para seguir el ritmo y para personas con dificultad auditiva. Pendiente: depende del modelo de voz 2D animado."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Resalta el texto mientras Mabel habla.
                    </p>
                  </div>
                  <Toggle
                    checked={form.subtitles}
                    onChange={(v) => update('subtitles', v)}
                    label="Subtítulos"
                    disabled
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

              {/*
                TODO: pendiente modelo 2D
                "Voz del asistente" hoy muestra IDs inventados (es-female-1,
                es-female-2, es-male-1). El backend Piper solo conoce el
                default `es_ES-mls_9972-low` (config.py:28) y hace fallback
                silencioso, por lo que ninguna selección distinta a
                "Por defecto" cambia nada. Se deja visible pero disabled
                hasta integrar el modelo 2D con TTS multi-voz.

                "Modo de interacción Inicial": la opción "Avatar 2D" se
                deja visible pero disabled (no hay implementación todavía
                en Chat.tsx). "Chat clásico" sigue activa.

                Memoria: `onboarding-pending-when-voice-avatar-lands.md`.
              */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ opacity: 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                        margin: 0,
                      }}
                    >
                      Voz del asistente
                    </p>
                    <InfoHint text="Elige el timbre con el que Mabel responderá cuando hable en voz alta. Pendiente: las voces se activan al integrar el modelo 2D animado con TTS." />
                  </div>
                  <NativeSelect
                    value={form.tts_voice}
                    onChange={(v) => update('tts_voice', v)}
                    ariaLabel="Voz del asistente"
                    disabled
                  >
                    <option value="">Por defecto</option>
                    <option value="es-female-1">Femenina 1</option>
                    <option value="es-female-2">Femenina 2</option>
                    <option value="es-male-1">Masculina 1</option>
                  </NativeSelect>
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink-900)',
                        margin: 0,
                      }}
                    >
                      Modo de interacción Inicial
                    </p>
                    <InfoHint text="Define con qué interfaz arranca cada conversación nueva: chat de texto clásico o un avatar 2D animado que habla y reacciona a tus respuestas. Podrás cambiar entre ambos durante la sesión. Pendiente: el avatar 2D se activa al integrar el modelo." />
                  </div>
                  <Segmented
                    ariaLabel="Modo de interacción inicial"
                    value={form.preferred_chat_mode}
                    onChange={(v) => update('preferred_chat_mode', v)}
                    options={[
                      { value: 'chat', label: 'Chat clásico', icon: MonitorSmartphone },
                      { value: 'avatar', label: 'Avatar 2D', icon: Bot, disabled: true },
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
