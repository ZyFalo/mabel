import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Type, MonitorSmartphone, Bot } from 'lucide-react'
import Toggle from '../components/ui/Toggle'
import Segmented from '../components/ui/Segmented'
import NativeSelect from '../components/ui/NativeSelect'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'

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
    <div className="min-h-screen w-full bg-[var(--ink-50)] flex flex-col items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-xl">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] uppercase tracking-wider text-[var(--ink-400)]">
              Paso {step + 1} / {STEPS.length}
            </p>
            <p className="text-[12px] font-medium text-[var(--ink-500)]">{STEPS[step]}</p>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--ink-200)' }}
          >
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{
                width: `${progressPct}%`,
                backgroundColor: 'var(--mabel-600)',
              }}
            />
          </div>
        </div>

        {/* Card */}
        <div
          key={step}
          className="bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 fade-in"
        >
          {/* Step 1: Privacidad */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-display italic text-[var(--ink-900)] mb-2">
                  Privacidad
                </h2>
                <p className="text-[14px] text-[var(--ink-500)]">
                  Configura como Mabel IA maneja tu informacion.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 py-2">
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[var(--ink-900)]">
                      Guardar historial de conversaciones
                    </p>
                    <p className="text-[12px] text-[var(--ink-500)] mt-0.5 leading-relaxed">
                      Si esta desactivado, los mensajes no se guardan despues de cerrar la sesion.
                    </p>
                  </div>
                  <Toggle
                    checked={form.save_history}
                    onChange={(v) => update('save_history', v)}
                    label="Guardar historial"
                  />
                </div>

                <div
                  className="h-px"
                  style={{ backgroundColor: 'var(--ink-100)' }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between gap-4 py-2">
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[var(--ink-900)]">
                      Check-in emocional al inicio
                    </p>
                    <p className="text-[12px] text-[var(--ink-500)] mt-0.5 leading-relaxed">
                      Te preguntaremos como te sientes antes de iniciar la conversacion.
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
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-display italic text-[var(--ink-900)] mb-2">
                  Accesibilidad
                </h2>
                <p className="text-[14px] text-[var(--ink-500)]">
                  Ajusta la interfaz a tus necesidades.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 py-2">
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[var(--ink-900)]">Alto contraste</p>
                    <p className="text-[12px] text-[var(--ink-500)] mt-0.5">
                      Aumenta el contraste de colores para mejor legibilidad.
                    </p>
                  </div>
                  <Toggle
                    checked={form.contrast}
                    onChange={(v) => update('contrast', v)}
                    label="Alto contraste"
                  />
                </div>

                <div
                  className="h-px"
                  style={{ backgroundColor: 'var(--ink-100)' }}
                  aria-hidden="true"
                />

                <div className="py-2">
                  <p className="text-[14px] font-medium text-[var(--ink-900)] mb-3">
                    Tamano de fuente
                  </p>
                  <Segmented
                    ariaLabel="Tamano de fuente"
                    value={form.font_size}
                    onChange={(v) => update('font_size', v)}
                    options={[
                      { value: 'small', label: 'Pequena', icon: Type },
                      { value: 'normal', label: 'Normal', icon: Type },
                      { value: 'large', label: 'Grande', icon: Type },
                    ]}
                  />
                </div>

                <div
                  className="h-px"
                  style={{ backgroundColor: 'var(--ink-100)' }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between gap-4 py-2">
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[var(--ink-900)]">Subtitulos TTS</p>
                    <p className="text-[12px] text-[var(--ink-500)] mt-0.5">
                      Resalta el texto mientras Mabel habla.
                    </p>
                  </div>
                  <Toggle
                    checked={form.subtitles}
                    onChange={(v) => update('subtitles', v)}
                    label="Subtitulos"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Voz */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[24px] font-display italic text-[var(--ink-900)] mb-2">
                  Voz
                </h2>
                <p className="text-[14px] text-[var(--ink-500)]">
                  Configura como suena Mabel IA.
                </p>
              </div>

              <div className="space-y-5">
                <div className="py-2">
                  <p className="text-[14px] font-medium text-[var(--ink-900)] mb-3">
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

                <div
                  className="h-px"
                  style={{ backgroundColor: 'var(--ink-100)' }}
                  aria-hidden="true"
                />

                <div className="py-2">
                  <p className="text-[14px] font-medium text-[var(--ink-900)] mb-3">
                    Modo de interaccion
                  </p>
                  <Segmented
                    ariaLabel="Modo de interaccion"
                    value={form.preferred_chat_mode}
                    onChange={(v) => update('preferred_chat_mode', v)}
                    options={[
                      { value: 'chat', label: 'Chat clasico', icon: MonitorSmartphone },
                      { value: 'avatar', label: 'Avatar 3D', icon: Bot },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-8 pt-6 border-t border-[var(--ink-100)]">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] text-[13px] font-medium rounded-lg hover:bg-[var(--ink-100)] transition-colors"
              >
                Anterior
              </button>
            ) : (
              <div className="w-[88px]" />
            )}
            <div className="flex-1" />
            <button
              onClick={handleSkip}
              disabled={saving}
              className="px-3 py-2.5 text-[13px] text-[var(--ink-500)] hover:text-[var(--ink-900)] transition-colors"
            >
              Omitir
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2.5 bg-[var(--mabel-600)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-[var(--mabel-600)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Guardando...' : 'Finalizar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
