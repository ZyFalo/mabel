import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import Toggle from '../components/ui/Toggle'
import InfoHint from '../components/admin/InfoHint'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import AuthShell from '../components/auth/AuthShell'
// NOTE: imports retirados del UI activo pero conservados como referencia
// para cuando reactivemos `contrast`, `font_size`, `tts_voice` selector
// y `preferred_chat_mode` (avatar): Type, MonitorSmartphone, Bot,
// Segmented, NativeSelect.

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

// El paso "Accesibilidad" se elimino del UI porque sus 3 controles
// (contrast, font_size, subtitles) tenian implementacion incompleta:
// contrast/font_size no aplicaban al DOM y subtitles depende de TTS
// (ahora vive en el paso de Voz junto a los toggles relacionados).
// Tambien retiramos del UI: tts_voice selector (solo tenemos 1 voz
// Piper) y preferred_chat_mode segmented (avatar default-open no
// implementado). Todos los campos siguen guardandose en BD por si
// los reactivamos despues — solo desaparecen de la pantalla.
const STEPS = ['Privacidad', 'Voz y experiencia']

interface FormState {
  save_history: boolean
  checkin_enabled: boolean
  // Voice & experience (paso 2 — todos guardados en accessibility JSONB
  // salvo preferred_chat_mode que es columna propia)
  voice_enabled: boolean         // master: permite que Mabel hable via TTS
  voice_mode_enabled: boolean    // muestra el boton "Hablar" y la ruta /voice
  tts_enabled: boolean           // autoplay TTS en el chat de texto
  subtitles: boolean             // resalta palabras mientras Mabel habla
  // Campos LATENTES — no se muestran en UI hoy pero el form los
  // mantiene para no romper la forma del POST a /preferences. Cuando
  // los reactivemos solo hay que volver a renderizar el control.
  contrast: boolean
  font_size: string
  tts_voice: string
  preferred_chat_mode: 'chat' | 'avatar'
}

const DEFAULT_STATE: FormState = {
  save_history: false,
  checkin_enabled: true,
  // Voz: master default TRUE (voz disponible para que la persona
  // decida). Sub-toggles: voice_mode_enabled default TRUE para mostrar
  // el boton "Hablar" (el modo voz 2D es una experiencia diferencial
  // del producto y ocultarlo por default es esconder la feature
  // principal). tts_enabled OPT-IN para no autoplay sin consentimiento
  // explicito (bug 2026-05-23). subtitles default TRUE — son ayuda
  // visual gratuita cuando ya hay TTS sonando.
  voice_enabled: true,
  voice_mode_enabled: true,
  tts_enabled: false,
  subtitles: true,
  contrast: false,
  font_size: 'normal',
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
      // COERCION: si el master voice_enabled está OFF, todos los
      // sub-flags deben ir a false. El UI los gatea visualmente (`checked
      // = form.voice_enabled && form.X`) pero el estado interno mantiene
      // su valor anterior, así que sin esta coerción se persiste un
      // estado inconsistente. Mismo patron que saveVoice en Settings.tsx.
      const effectiveVoiceMode = form.voice_enabled ? form.voice_mode_enabled : false
      const effectiveTtsEnabled = form.voice_enabled ? form.tts_enabled : false
      const effectiveSubtitles = form.voice_enabled ? form.subtitles : false
      await updatePreferences({
        save_history: form.save_history,
        checkin_enabled: form.checkin_enabled,
        accessibility: {
          // Keys ACTIVAS (visibles en el UI del paso 2):
          voice_enabled: form.voice_enabled,
          voice_mode_enabled: effectiveVoiceMode,
          tts_enabled: effectiveTtsEnabled,
          subtitles: effectiveSubtitles,
          // Keys LATENTES — guardadas para no perder el shape JSONB
          // cuando reactivemos los controles.
          contrast: form.contrast,
          font_size: form.font_size,
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

          {/* Step 2: Voz y experiencia.
              4 toggles con jerarquia: voice_enabled es el master; los
              otros 3 quedan visibles pero disabled si voice_enabled=off
              porque carecen de sentido sin TTS. */}
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
                Voz y experiencia
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 22px', lineHeight: 1.55 }}>
                Decide si quieres oir a Mabel y como prefieres interactuar.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Master: voice_enabled */}
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
                      title="Voz de Mabel"
                      hint="Permite que Mabel responda con voz sintetizada. Si lo desactivas, todas las respuestas seran solo texto y no podras entrar al modo voz 2D."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Activa la voz de Mabel — base para los siguientes ajustes.
                    </p>
                  </div>
                  <Toggle
                    checked={form.voice_enabled}
                    onChange={(v) => update('voice_enabled', v)}
                    label="Voz de Mabel"
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                {/* voice_mode_enabled — gated */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    opacity: form.voice_enabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <OptionLabel
                      title="Modo voz 2D"
                      hint="Muestra el boton 'Hablar' en la cabecera del chat para entrar al modo conversacion por voz con avatar 2D animado de Mabel."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Habilita el modo conversacion con avatar animado.
                    </p>
                  </div>
                  <Toggle
                    checked={form.voice_enabled && form.voice_mode_enabled}
                    onChange={(v) => update('voice_mode_enabled', v)}
                    label="Modo voz 2D"
                    disabled={!form.voice_enabled}
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                {/* tts_enabled (autoplay en chat texto) — gated */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    opacity: form.voice_enabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <OptionLabel
                      title="Mabel lee sus respuestas en chat texto"
                      hint="Cuando Mabel responde en el chat de texto, su mensaje se reproduce automaticamente en voz alta sin que tengas que pedirlo."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Autoplay TTS en el chat de texto (opcional).
                    </p>
                  </div>
                  <Toggle
                    checked={form.voice_enabled && form.tts_enabled}
                    onChange={(v) => update('tts_enabled', v)}
                    label="Autoplay TTS"
                    disabled={!form.voice_enabled}
                  />
                </div>

                <div style={{ height: 1, background: 'var(--ink-100)' }} aria-hidden />

                {/* subtitles — gated */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    opacity: form.voice_enabled ? 1 : 0.5,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <OptionLabel
                      title="Resaltar palabras mientras Mabel habla"
                      hint="En cualquier mensaje de Mabel que se reproduzca por voz, resalta en su burbuja la palabra que esta pronunciando ahora mismo — util para seguir el ritmo y para baja audicion."
                    />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Subtitulos con highlight palabra por palabra.
                    </p>
                  </div>
                  <Toggle
                    checked={form.voice_enabled && form.subtitles}
                    onChange={(v) => update('subtitles', v)}
                    label="Subtitulos"
                    disabled={!form.voice_enabled}
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
