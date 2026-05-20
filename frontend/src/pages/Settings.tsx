import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Lock,
  Eye,
  Volume2,
  Palette,
  User,
  Database,
  X,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useTheme, type ThemeMode } from '../hooks/useTheme'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import apiClient from '../api/client'
import Toggle from '../components/ui/Toggle'
import Segmented from '../components/ui/Segmented'
import Field from '../components/ui/Field'
import NativeSelect from '../components/ui/NativeSelect'
import DeleteAccountModal from '../components/settings/DeleteAccountModal'
import RevokeConsentModal from '../components/settings/RevokeConsentModal'
import ArcoExportModal from '../components/settings/ArcoExportModal'
import ChangePasswordModal from '../components/settings/ChangePasswordModal'

type TabId =
  | 'privacy'
  | 'accessibility'
  | 'voice'
  | 'appearance'
  | 'account'
  | 'arco'

const TABS: { id: TabId; icon: typeof Lock; label: string }[] = [
  { id: 'privacy', icon: Lock, label: 'Privacidad' },
  { id: 'accessibility', icon: Eye, label: 'Accesibilidad' },
  { id: 'voice', icon: Volume2, label: 'Voz' },
  { id: 'appearance', icon: Palette, label: 'Apariencia' },
  { id: 'account', icon: User, label: 'Cuenta' },
  { id: 'arco', icon: Database, label: 'Mis datos (ARCO)' },
]

// ---------------------------------------------------------------------------
// Section header (Fraunces italic + supporting description + bottom border)
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string
  description?: string
}

function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div
      className="mb-2 pb-4 border-b"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <h2
        className="text-[20px] font-display italic"
        style={{ color: 'var(--text-strong)' }}
      >
        {title}
      </h2>
      {description ? (
        <p
          className="text-[13px] mt-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save button (primary, accent bg)
// ---------------------------------------------------------------------------

interface SaveButtonProps {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function SaveButton({ onClick, disabled, children }: SaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-6 px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{
        backgroundColor: 'var(--accent)',
        color: '#FFFFFF',
      }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function SettingsHeader({ onClose }: { onClose: () => void }) {
  return (
    <header
      className="h-12 flex items-center justify-between px-4 border-b shrink-0"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div
        className="text-[14.5px] font-display italic"
        style={{ color: 'var(--text-strong)' }}
      >
        Configuracion
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Volver (Esc)"
        aria-label="Cerrar configuracion"
        className="p-1.5 rounded-md transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
            'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
            'transparent'
        }}
      >
        <X size={16} />
      </button>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Vertical nav (desktop) / horizontal scroll (mobile)
// ---------------------------------------------------------------------------

interface SettingsNavProps {
  activeTab: TabId
  onChange: (id: TabId) => void
}

function SettingsNav({ activeTab, onChange }: SettingsNavProps) {
  return (
    <nav
      aria-label="Secciones de configuracion"
      className="shrink-0 md:w-[220px] border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-y-auto"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <ul className="flex md:flex-col p-2 md:p-3 gap-0.5 whitespace-nowrap">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <li key={tab.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-full flex items-center gap-2 md:gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                  isActive ? 'font-medium' : ''
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                  color: isActive ? 'var(--text-strong)' : 'var(--text)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'var(--bg-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'transparent'
                  }
                }}
              >
                <Icon
                  size={14}
                  style={{
                    color: isActive ? 'var(--accent)' : 'currentColor',
                  }}
                />
                <span>{tab.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Settings parent component
// ---------------------------------------------------------------------------

const VALID_TABS: ReadonlySet<TabId> = new Set([
  'privacy',
  'accessibility',
  'voice',
  'appearance',
  'account',
  'arco',
])

export default function Settings() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const preferences = usePreferencesStore((s) => s.preferences)
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences)
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)
  const { theme, setTheme } = useTheme()

  // Local form state for each section
  const [saveHistory, setSaveHistory] = useState(false)
  const [checkinEnabled, setCheckinEnabled] = useState(true)
  const [contrast, setContrast] = useState(false)
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(
    'normal',
  )
  const [subtitles, setSubtitles] = useState(true)
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [chatMode, setChatMode] = useState<'chat' | 'avatar'>('chat')
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [consentScope, setConsentScope] = useState<string>('')

  // Active tab — read initial from ?tab= query param (deeplink from UserMenu)
  const initialTab = (() => {
    const fromUrl = searchParams.get('tab')
    return fromUrl && VALID_TABS.has(fromUrl as TabId) ? (fromUrl as TabId) : 'privacy'
  })()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  // Sync activeTab → URL (so refresh keeps the tab)
  useEffect(() => {
    if (searchParams.get('tab') !== activeTab) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    }
  }, [activeTab, searchParams, setSearchParams])

  // React to URL changes (e.g. user clicks another tab shortcut in UserMenu while already on /settings)
  useEffect(() => {
    const fromUrl = searchParams.get('tab')
    if (fromUrl && VALID_TABS.has(fromUrl as TabId) && fromUrl !== activeTab) {
      setActiveTab(fromUrl as TabId)
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Modal states
  const [showDelete, setShowDelete] = useState(false)
  const [showRevoke, setShowRevoke] = useState(false)
  const [showArco, setShowArco] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Hydrate from preferences
  useEffect(() => {
    if (preferences) {
      setSaveHistory(preferences.save_history)
      setCheckinEnabled(preferences.checkin_enabled)
      const acc = preferences.accessibility as Record<string, unknown> | null
      setContrast(!!acc?.contrast)
      const fs = acc?.font_size as string | undefined
      setFontSize(
        fs === 'small' || fs === 'normal' || fs === 'large' ? fs : 'normal',
      )
      setSubtitles(acc?.subtitles !== false)
      setTtsVoice(preferences.tts_voice || '')
      setTtsEnabled(acc?.tts_enabled !== false)
      setChatMode(preferences.preferred_chat_mode)
    }
  }, [preferences])

  // Load consent scope (for RevokeConsentModal)
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

  // Close handler — back if possible, fallback /home
  const handleClose = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/home')
  }

  // Esc shortcut
  useKeyboardShortcuts({ esc: handleClose })

  // -------------------------------------------------------------------------
  // Save handlers (PRESERVED EXACTLY from previous implementation)
  // -------------------------------------------------------------------------

  async function savePrivacy() {
    try {
      await updatePreferences({
        save_history: saveHistory,
        checkin_enabled: checkinEnabled,
      })
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
      const res = await apiClient.get('/tts/synthesize', {
        params,
        responseType: 'blob',
      })
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
        accessibility: {
          ...((preferences?.accessibility as Record<string, unknown>) || {}),
          tts_enabled: ttsEnabled,
        },
      })
      addToast({ type: 'success', message: 'Cambios guardados' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar' })
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className="flex flex-col h-screen fade-in"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <SettingsHeader onClose={handleClose} />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        <SettingsNav activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-2xl px-6 md:px-10 py-6 md:py-8 mx-auto md:mx-0">
            {activeTab === 'privacy' && (
              <PrivacyTab
                saveHistory={saveHistory}
                setSaveHistory={setSaveHistory}
                checkinEnabled={checkinEnabled}
                setCheckinEnabled={setCheckinEnabled}
                onSave={savePrivacy}
              />
            )}

            {activeTab === 'accessibility' && (
              <AccessibilityTab
                contrast={contrast}
                setContrast={setContrast}
                fontSize={fontSize}
                setFontSize={setFontSize}
                subtitles={subtitles}
                setSubtitles={setSubtitles}
                onSave={saveAccessibility}
              />
            )}

            {activeTab === 'voice' && (
              <VoiceTab
                ttsEnabled={ttsEnabled}
                setTtsEnabled={setTtsEnabled}
                ttsVoice={ttsVoice}
                setTtsVoice={setTtsVoice}
                chatMode={chatMode}
                setChatMode={setChatMode}
                previewPlaying={previewPlaying}
                previewVoice={previewVoice}
                onSave={saveVoice}
              />
            )}

            {activeTab === 'appearance' && (
              <ApariencaTab theme={theme} setTheme={setTheme} />
            )}

            {activeTab === 'account' && (
              <AccountTab
                email={user?.email ?? ''}
                onChangePassword={() => setShowPassword(true)}
                onRevokeConsent={() => setShowRevoke(true)}
                onDeleteAccount={() => setShowDelete(true)}
              />
            )}

            {activeTab === 'arco' && (
              <ArcoTab onOpenExport={() => setShowArco(true)} />
            )}
          </div>
        </div>
      </div>

      {/* Modals — APIs preserved exactly */}
      <DeleteAccountModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
      />
      <RevokeConsentModal
        open={showRevoke}
        onClose={() => setShowRevoke(false)}
        currentScope={consentScope || 'solo_uso'}
      />
      <ArcoExportModal open={showArco} onClose={() => setShowArco(false)} />
      <ChangePasswordModal
        open={showPassword}
        onClose={() => setShowPassword(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy Tab
// ---------------------------------------------------------------------------

interface PrivacyTabProps {
  saveHistory: boolean
  setSaveHistory: (v: boolean) => void
  checkinEnabled: boolean
  setCheckinEnabled: (v: boolean) => void
  onSave: () => void
}

function PrivacyTab({
  saveHistory,
  setSaveHistory,
  checkinEnabled,
  setCheckinEnabled,
  onSave,
}: PrivacyTabProps) {
  return (
    <section>
      <SectionHeader
        title="Privacidad"
        description="Controla que guarda Mabel y como lo usa."
      />
      <Field
        label="Guardar historial de conversaciones"
        description="Si esta activo, las conversaciones quedan en tu historial para revisitas y aporta al estudio."
      >
        <Toggle checked={saveHistory} onChange={setSaveHistory} />
      </Field>
      <Field
        label="Check-in emocional al inicio"
        description="Pregunta opcional sobre tu estado emocional cuando inicias sesion."
      >
        <Toggle checked={checkinEnabled} onChange={setCheckinEnabled} />
      </Field>
      <SaveButton onClick={onSave}>Guardar</SaveButton>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Accessibility Tab
// ---------------------------------------------------------------------------

interface AccessibilityTabProps {
  contrast: boolean
  setContrast: (v: boolean) => void
  fontSize: 'small' | 'normal' | 'large'
  setFontSize: (v: 'small' | 'normal' | 'large') => void
  subtitles: boolean
  setSubtitles: (v: boolean) => void
  onSave: () => void
}

function AccessibilityTab({
  contrast,
  setContrast,
  fontSize,
  setFontSize,
  subtitles,
  setSubtitles,
  onSave,
}: AccessibilityTabProps) {
  return (
    <section>
      <SectionHeader
        title="Accesibilidad"
        description="Ajusta la presentacion visual y auditiva."
      />
      <Field
        label="Alto contraste"
        description="Aumenta el contraste entre texto y fondo para mejor lectura."
      >
        <Toggle checked={contrast} onChange={setContrast} />
      </Field>
      <Field
        label="Tamano de fuente"
        description="Aplica a todas las pantallas. Persiste entre sesiones."
      >
        <Segmented<'small' | 'normal' | 'large'>
          value={fontSize}
          onChange={setFontSize}
          options={[
            { value: 'small', label: 'Pequena' },
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Grande' },
          ]}
          ariaLabel="Tamano de fuente"
        />
      </Field>
      <Field
        label="Subtitulos TTS"
        description="Resalta cada palabra mientras Mabel habla. Util si tienes el audio bajo."
      >
        <Toggle checked={subtitles} onChange={setSubtitles} />
      </Field>
      <SaveButton onClick={onSave}>Guardar</SaveButton>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Voice Tab
// ---------------------------------------------------------------------------

interface VoiceTabProps {
  ttsEnabled: boolean
  setTtsEnabled: (v: boolean) => void
  ttsVoice: string
  setTtsVoice: (v: string) => void
  chatMode: 'chat' | 'avatar'
  setChatMode: (v: 'chat' | 'avatar') => void
  previewPlaying: boolean
  previewVoice: () => void
  onSave: () => void
}

function VoiceTab({
  ttsEnabled,
  setTtsEnabled,
  ttsVoice,
  setTtsVoice,
  chatMode,
  setChatMode,
  previewPlaying,
  previewVoice,
  onSave,
}: VoiceTabProps) {
  return (
    <section>
      <SectionHeader
        title="Voz"
        description="Configura la sintesis de voz y el modo de interaccion."
      />
      <Field
        label="TTS activado"
        description="Reproducir respuestas con voz. Puedes silenciar puntualmente en el chat."
      >
        <Toggle checked={ttsEnabled} onChange={setTtsEnabled} />
      </Field>
      <Field
        label="Voz del asistente"
        description="Elige el timbre. Usa Preview para escuchar un fragmento breve."
        vertical
      >
        <div className="flex gap-2 items-center">
          <NativeSelect
            value={ttsVoice}
            onChange={setTtsVoice}
            ariaLabel="Voz del asistente"
          >
            <option value="">Por defecto</option>
            <option value="es-female-1">Femenina 1</option>
            <option value="es-female-2">Femenina 2</option>
            <option value="es-male-1">Masculina 1</option>
          </NativeSelect>
          <button
            type="button"
            onClick={previewVoice}
            disabled={previewPlaying}
            className="px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--text-strong)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {previewPlaying ? 'Reproduciendo...' : 'Preview'}
          </button>
        </div>
      </Field>
      <Field
        label="Modo de interaccion"
        description="Elige entre chat clasico o avatar 3D animado."
      >
        <Segmented<'chat' | 'avatar'>
          value={chatMode}
          onChange={setChatMode}
          options={[
            { value: 'chat', label: 'Chat clasico' },
            { value: 'avatar', label: 'Avatar 3D' },
          ]}
          ariaLabel="Modo de interaccion"
        />
      </Field>
      <SaveButton onClick={onSave}>Guardar</SaveButton>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Apariencia Tab (NEW)
// ---------------------------------------------------------------------------

interface ApariencaTabProps {
  theme: ThemeMode
  setTheme: (v: ThemeMode) => void
}

function ApariencaTab({ theme, setTheme }: ApariencaTabProps) {
  return (
    <section>
      <SectionHeader
        title="Apariencia"
        description="Tema visual y comportamiento de la interfaz."
      />
      <Field
        label="Tema"
        description="Claro, oscuro o automatico segun tu sistema. El cambio es inmediato y se persiste."
      >
        <Segmented<ThemeMode>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Claro', icon: Sun },
            { value: 'dark', label: 'Oscuro', icon: Moon },
            { value: 'auto', label: 'Auto', icon: Monitor },
          ]}
          ariaLabel="Tema visual"
        />
      </Field>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Account Tab
// ---------------------------------------------------------------------------

interface AccountTabProps {
  email: string
  onChangePassword: () => void
  onRevokeConsent: () => void
  onDeleteAccount: () => void
}

function AccountTab({
  email,
  onChangePassword,
  onRevokeConsent,
  onDeleteAccount,
}: AccountTabProps) {
  return (
    <section>
      <SectionHeader
        title="Cuenta"
        description="Tu identidad y opciones criticas."
      />
      <Field label="Email" description="No se puede cambiar el email.">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {email || '-'}
        </span>
      </Field>

      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={onChangePassword}
          className="w-full text-left px-4 py-3 rounded-lg text-sm transition-colors"
          style={{
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-strong)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--bg-active)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--bg-hover)'
          }}
        >
          Cambiar contrasena
        </button>
        <button
          type="button"
          onClick={onRevokeConsent}
          className="w-full text-left px-4 py-3 rounded-lg text-sm transition-colors"
          style={{
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--text-strong)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--bg-active)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'var(--bg-hover)'
          }}
        >
          Revocar consentimiento
        </button>
        <button
          type="button"
          onClick={onDeleteAccount}
          className="w-full text-left px-4 py-3 rounded-lg text-sm transition-colors"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--danger) 5%, transparent)',
            border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
            color: 'var(--danger)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'color-mix(in srgb, var(--danger) 10%, transparent)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
              'color-mix(in srgb, var(--danger) 5%, transparent)'
          }}
        >
          Eliminar cuenta
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// ARCO Tab
// ---------------------------------------------------------------------------

interface ArcoTabProps {
  onOpenExport: () => void
}

function ArcoTab({ onOpenExport }: ArcoTabProps) {
  return (
    <section>
      <SectionHeader
        title="Mis Datos (ARCO)"
        description="Ley 1581 de 2012 — derecho a Acceso, Rectificacion, Cancelacion y Oposicion."
      />
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Segun la Ley 1581 de 2012, tienes derecho a acceder, rectificar, cancelar
        y oponerte al tratamiento de tus datos personales. Descarga tu informacion
        en formato JSON o CSV para revisarla.
      </p>
      <button
        type="button"
        onClick={onOpenExport}
        className="px-4 py-2 text-sm font-medium rounded-lg transition-opacity hover:opacity-90"
        style={{
          backgroundColor: 'var(--accent)',
          color: '#FFFFFF',
        }}
      >
        Ver mis datos
      </button>
    </section>
  )
}
