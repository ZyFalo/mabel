import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1.5 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
            <p
              className={`text-xs mt-1.5 text-center ${
                i === step ? 'text-primary font-medium' : 'text-text-primary/40'
              }`}
            >
              {s}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-text-primary/50 mb-6">
        Paso {step + 1} de {STEPS.length}
      </p>

      {/* Step 1: Privacidad */}
      {step === 0 && (
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-text-primary">Privacidad</h2>
          <p className="text-sm text-text-primary/60">
            Configura como Mabel IA maneja tu informacion.
          </p>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-text-primary">Guardar historial de conversaciones</p>
              <p className="text-xs text-text-primary/50 mt-0.5">
                Si esta desactivado, los mensajes no se guardan despues de cerrar la sesion.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.save_history}
              onChange={(e) => update('save_history', e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-text-primary">Check-in emocional al inicio</p>
              <p className="text-xs text-text-primary/50 mt-0.5">
                Te preguntaremos como te sientes antes de iniciar la conversacion.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.checkin_enabled}
              onChange={(e) => update('checkin_enabled', e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
        </div>
      )}

      {/* Step 2: Accesibilidad */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-text-primary">Accesibilidad</h2>
          <p className="text-sm text-text-primary/60">
            Ajusta la interfaz a tus necesidades.
          </p>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-text-primary">Alto contraste</p>
            </div>
            <input
              type="checkbox"
              checked={form.contrast}
              onChange={(e) => update('contrast', e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>

          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-text-primary mb-2">Tamano de fuente</p>
            <div className="flex gap-2">
              {(['small', 'normal', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => update('font_size', size)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.font_size === size
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-text-primary hover:border-primary/30'
                  }`}
                >
                  {size === 'small' ? 'Pequena' : size === 'normal' ? 'Normal' : 'Grande'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
            <div>
              <p className="text-sm font-medium text-text-primary">Subtitulos TTS</p>
              <p className="text-xs text-text-primary/50 mt-0.5">
                Resalta el texto mientras Mabel habla.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.subtitles}
              onChange={(e) => update('subtitles', e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
        </div>
      )}

      {/* Step 3: Voz */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-text-primary">Voz</h2>
          <p className="text-sm text-text-primary/60">
            Configura como suena Mabel IA.
          </p>

          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-text-primary mb-2">Voz del asistente</p>
            <select
              value={form.tts_voice}
              onChange={(e) => update('tts_voice', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">Por defecto</option>
              <option value="es-female-1">Femenina 1</option>
              <option value="es-female-2">Femenina 2</option>
              <option value="es-male-1">Masculina 1</option>
            </select>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-text-primary mb-2">Modo de interaccion</p>
            <div className="flex gap-2">
              {(['chat', 'avatar'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => update('preferred_chat_mode', mode)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.preferred_chat_mode === mode
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-text-primary hover:border-primary/30'
                  }`}
                >
                  {mode === 'chat' ? 'Chat clasico' : 'Avatar 3D'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-8">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="px-5 py-2.5 border border-gray-200 text-sm font-medium rounded-lg text-text-primary hover:bg-gray-50 transition-colors"
          >
            Anterior
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={handleSkip}
          disabled={saving}
          className="px-5 py-2.5 text-sm text-text-primary/50 hover:text-text-primary transition-colors"
        >
          Omitir
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Empezar'}
          </button>
        )}
      </div>
    </div>
  )
}
