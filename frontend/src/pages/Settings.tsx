import { useEffect, useState } from 'react'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import apiClient from '../api/client'
import DeleteAccountModal from '../components/settings/DeleteAccountModal'
import RevokeConsentModal from '../components/settings/RevokeConsentModal'
import ArcoExportModal from '../components/settings/ArcoExportModal'
import ChangePasswordModal from '../components/settings/ChangePasswordModal'

export default function Settings() {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences)
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

  // Local form state for each section
  const [saveHistory, setSaveHistory] = useState(false)
  const [checkinEnabled, setCheckinEnabled] = useState(true)
  const [contrast, setContrast] = useState(false)
  const [fontSize, setFontSize] = useState('normal')
  const [subtitles, setSubtitles] = useState(true)
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [chatMode, setChatMode] = useState<'chat' | 'avatar'>('chat')
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [consentScope, setConsentScope] = useState<string>('')

  // Modal states
  const [showDelete, setShowDelete] = useState(false)
  const [showRevoke, setShowRevoke] = useState(false)
  const [showArco, setShowArco] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (preferences) {
      setSaveHistory(preferences.save_history)
      setCheckinEnabled(preferences.checkin_enabled)
      const acc = preferences.accessibility as Record<string, unknown> | null
      setContrast(!!acc?.contrast)
      setFontSize((acc?.font_size as string) || 'normal')
      setSubtitles(acc?.subtitles !== false)
      setTtsVoice(preferences.tts_voice || '')
      setTtsEnabled(acc?.tts_enabled !== false)
      setChatMode(preferences.preferred_chat_mode)
    }
  }, [preferences])

  useEffect(() => {
    apiClient
      .get('/users/me/consent-status')
      .then((res) => {
        if (res.data.scope) {
          setConsentScope(res.data.scope)
        }
      })
      .catch(() => {})
  }, [])

  async function savePrivacy() {
    try {
      await updatePreferences({ save_history: saveHistory, checkin_enabled: checkinEnabled })
      addToast({ type: 'success', message: 'Cambios guardados' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar' })
    }
  }

  async function saveAccessibility() {
    try {
      await updatePreferences({
        accessibility: { contrast, font_size: fontSize, subtitles },
      })
      addToast({ type: 'success', message: 'Cambios guardados' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar' })
    }
  }

  async function previewVoice() {
    if (previewPlaying) return
    setPreviewPlaying(true)
    try {
      const params: Record<string, string> = { text: 'Hola, soy Mabel' }
      if (ttsVoice) params.voice = ttsVoice
      const res = await apiClient.get('/tts/synthesize', { params, responseType: 'blob' })
      const blob = res.data as Blob
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPreviewPlaying(false)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setPreviewPlaying(false)
      }
      audio.play()
    } catch {
      addToast({ type: 'error', message: 'Error al reproducir preview' })
      setPreviewPlaying(false)
    }
  }

  async function saveVoice() {
    try {
      await updatePreferences({
        tts_voice: ttsVoice || null,
        preferred_chat_mode: chatMode,
        accessibility: { ...((preferences?.accessibility as Record<string, unknown>) || {}), tts_enabled: ttsEnabled },
      })
      addToast({ type: 'success', message: 'Cambios guardados' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar' })
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Preferencias</h1>

      {/* Privacidad */}
      <section className="mb-8 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Privacidad</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-primary">Guardar historial de conversaciones</span>
            <input
              type="checkbox"
              checked={saveHistory}
              onChange={(e) => setSaveHistory(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-primary">Check-in emocional al inicio</span>
            <input
              type="checkbox"
              checked={checkinEnabled}
              onChange={(e) => setCheckinEnabled(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
        </div>
        <button
          onClick={savePrivacy}
          className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          Guardar
        </button>
      </section>

      {/* Accesibilidad */}
      <section className="mb-8 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Accesibilidad</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-primary">Alto contraste</span>
            <input
              type="checkbox"
              checked={contrast}
              onChange={(e) => setContrast(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
          <div>
            <p className="text-sm text-text-primary mb-2">Tamano de fuente</p>
            <div className="flex gap-2">
              {(['small', 'normal', 'large'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    fontSize === s
                      ? 'bg-primary text-white'
                      : 'bg-gray-50 text-text-primary hover:bg-gray-100'
                  }`}
                >
                  {s === 'small' ? 'Pequena' : s === 'normal' ? 'Normal' : 'Grande'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-primary">Subtitulos TTS</span>
            <input
              type="checkbox"
              checked={subtitles}
              onChange={(e) => setSubtitles(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
        </div>
        <button
          onClick={saveAccessibility}
          className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          Guardar
        </button>
      </section>

      {/* Voz */}
      <section className="mb-8 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Voz</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-primary">TTS activado</span>
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary"
            />
          </label>
          <div>
            <p className="text-sm text-text-primary mb-2">Voz del asistente</p>
            <div className="flex gap-2">
              <select
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">Por defecto</option>
                <option value="es-female-1">Femenina 1</option>
                <option value="es-female-2">Femenina 2</option>
                <option value="es-male-1">Masculina 1</option>
              </select>
              <button
                onClick={previewVoice}
                disabled={previewPlaying}
                className="px-3 py-2 bg-gray-100 text-text-primary/60 text-sm rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {previewPlaying ? 'Reproduciendo...' : 'Preview'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm text-text-primary mb-2">Modo de interaccion</p>
            <div className="flex gap-2">
              {(['chat', 'avatar'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChatMode(m)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    chatMode === m
                      ? 'bg-primary text-white'
                      : 'bg-gray-50 text-text-primary hover:bg-gray-100'
                  }`}
                >
                  {m === 'chat' ? 'Chat clasico' : 'Avatar 3D'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={saveVoice}
          className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
        >
          Guardar
        </button>
      </section>

      {/* Cuenta */}
      <section className="mb-8 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Cuenta</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">Email</span>
            <span className="text-sm text-text-primary/60">{user?.email}</span>
          </div>
          <button
            onClick={() => setShowPassword(true)}
            className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm text-text-primary hover:bg-gray-100 transition-colors"
          >
            Cambiar contrasena
          </button>
          <button
            onClick={() => setShowRevoke(true)}
            className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm text-text-primary hover:bg-gray-100 transition-colors"
          >
            Revocar consentimiento
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="w-full text-left px-4 py-3 bg-danger/5 border border-danger/20 rounded-lg text-sm text-danger hover:bg-danger/10 transition-colors"
          >
            Eliminar cuenta
          </button>
        </div>
      </section>

      {/* Mis Datos (ARCO) */}
      <section className="mb-8 bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Mis Datos (ARCO)</h2>
        <p className="text-sm text-text-primary/60 mb-4">
          Segun la Ley 1581 de 2012, tienes derecho a acceder, rectificar, cancelar y oponerte al
          tratamiento de tus datos personales.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowArco(true)}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors"
          >
            Ver mis datos
          </button>
        </div>
      </section>

      {/* Modals */}
      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
      <RevokeConsentModal
        open={showRevoke}
        onClose={() => setShowRevoke(false)}
        currentScope={consentScope || 'solo_uso'}
      />
      <ArcoExportModal open={showArco} onClose={() => setShowArco(false)} />
      <ChangePasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
    </div>
  )
}
