import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Lock,
  Eye,
  Volume2,
  User,
  Database,
  X,
  Shield,
  ShieldOff,
  Info,
  AlertTriangle,
  Trash2,
  Mail,
} from 'lucide-react'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useAuthStore } from '../stores/authStore'
import { useToastStore } from '../stores/toastStore'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import apiClient from '../api/client'
import Segmented from '../components/ui/Segmented'
import NativeSelect from '../components/ui/NativeSelect'
import DeleteAccountModal from '../components/settings/DeleteAccountModal'
import RevokeConsentModal from '../components/settings/RevokeConsentModal'
import ArcoExportModal from '../components/settings/ArcoExportModal'
import ChangePasswordModal from '../components/settings/ChangePasswordModal'
import ConfirmHideHistoryModal from '../components/settings/ConfirmHideHistoryModal'
import { useChatStore } from '../stores/chatStore'

// Settings overlay primitives (Cap 6.4)
import SettingsField from '../components/settings/primitives/SettingsField'
import Toggle from '../components/settings/primitives/Toggle'
import Card from '../components/settings/primitives/Card'
import PrimaryButton from '../components/settings/primitives/PrimaryButton'
import SaveBar from '../components/settings/primitives/SaveBar'
import SettingsNavItem from '../components/settings/primitives/SettingsNavItem'
import SectionHeader from '../components/settings/primitives/SectionHeader'

export type TabId = 'privacy' | 'accessibility' | 'voice' | 'account' | 'arco'

const VALID_TABS: ReadonlySet<TabId> = new Set([
  'privacy',
  'accessibility',
  'voice',
  'account',
  'arco',
])

interface SectionDef {
  id: TabId
  icon: ReactNode
  title: string
  subtitle: string
}

const SECTIONS: SectionDef[] = [
  {
    id: 'privacy',
    icon: <Lock size={16} />,
    title: 'Privacidad',
    subtitle: 'Datos y consentimiento',
  },
  {
    id: 'accessibility',
    icon: <Eye size={16} />,
    title: 'Accesibilidad',
    subtitle: 'Personalizar experiencia',
  },
  {
    id: 'voice',
    icon: <Volume2 size={16} />,
    title: 'Voz',
    subtitle: 'TTS y voz del asistente',
  },
  {
    id: 'account',
    icon: <User size={16} />,
    title: 'Cuenta',
    subtitle: 'Seguridad y eliminacion',
  },
  {
    id: 'arco',
    icon: <Database size={16} />,
    title: 'Mis datos (ARCO)',
    subtitle: 'Tus datos personales',
  },
]

// ---------------------------------------------------------------------------
// Settings — modal overlay (Cap 6.4)
// ---------------------------------------------------------------------------

interface SettingsProps {
  /** Controls visibility. When false, the component returns null. */
  open: boolean
  /** Called when the user dismisses the modal (backdrop, Esc, or close button). */
  onClose: () => void
  /** Tab to open on first render. Defaults to 'privacy'. */
  initialTab?: TabId
}

export default function Settings({ open, onClose, initialTab: initialTabProp = 'privacy' }: SettingsProps) {
  const preferences = usePreferencesStore((s) => s.preferences)
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences)
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

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
  // CRÍTICO (code-review 2026-05-23 #1): consentScope arranca como
  // `null` (no como `''`) para que el modal de ConfirmHideHistory
  // interprete "scope desconocido" como el caso mas restrictivo
  // (hard delete = lo que backend ACTUALMENTE va a ejecutar para
  // scope solo_uso o sin consentimiento). Sin esto, una race entre
  // abrir Settings y la fetch de /users/me/consent-status hace que
  // un usuario solo_uso vea el copy de soft-hide mientras el backend
  // hard-deletea — viola Ley 1581 art. 4 lit. d (no engaño).
  const [consentScope, setConsentScope] = useState<string | null>(null)

  // Active tab — start with the prop value; the parent can change it
  // between mounts via `initialTab` and we react to that.
  const [activeTab, setActiveTab] = useState<TabId>(
    VALID_TABS.has(initialTabProp) ? initialTabProp : 'privacy',
  )

  // When the parent re-opens the modal with a different `initialTab`,
  // jump to it. (e.g. UserMenu deeplinks "account" vs "privacy".)
  useEffect(() => {
    if (open && VALID_TABS.has(initialTabProp)) {
      setActiveTab(initialTabProp)
    }
  }, [open, initialTabProp])

  // Modal states
  const [showDelete, setShowDelete] = useState(false)
  const [showRevoke, setShowRevoke] = useState(false)
  const [showArco, setShowArco] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Modal de confirmacion del toggle "Guardar historial" → OFF
  // (paquete control de datos 2026-05-23). Solo se abre cuando el
  // usuario intenta desactivar el toggle, no al activarlo.
  const [showHideHistory, setShowHideHistory] = useState(false)
  const [hideHistorySubmitting, setHideHistorySubmitting] = useState(false)
  const loadSessions = useChatStore((s) => s.loadSessions)

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

  // Load consent scope (for RevokeConsentModal). Lazy: only fires the
  // first time the user actually opens Settings, not on every authenticated
  // page load — Settings is now permanently mounted inside StudentLayout.
  const consentScopeLoadedRef = useRef(false)
  useEffect(() => {
    if (!open || consentScopeLoadedRef.current) return
    consentScopeLoadedRef.current = true
    apiClient
      .get('/users/me/consent-status')
      .then((res) => {
        if (res.data.scope) {
          setConsentScope(res.data.scope)
        }
      })
      .catch(() => {})
  }, [open])

  // Reset sub-modal flags when the parent Settings is dismissed. Without
  // this, the component stays mounted (returns null when !open) and any
  // sub-modal that was open at close time would re-appear on next reopen.
  // Especially important for destructive sub-modals: an aborted
  // "Eliminar cuenta" or "Cambiar contraseña" shouldn't ambush the user
  // the next time they open Settings.
  useEffect(() => {
    if (!open) {
      setShowDelete(false)
      setShowRevoke(false)
      setShowArco(false)
      setShowPassword(false)
    }
  }, [open])

  // Close handler — delegates to parent.
  const handleClose = onClose

  // Esc shortcut: only fires when Settings is open AND no sub-modal is
  // active. Sub-modals (DeleteAccount, RevokeConsent, ChangePassword,
  // ArcoExport) handle their own Esc keypresses; we don't want a single
  // Esc to collapse two layers at once.
  const anySubModalOpen = showDelete || showRevoke || showArco || showPassword
  useKeyboardShortcuts(open && !anySubModalOpen ? { esc: handleClose } : {})

  // -------------------------------------------------------------------------
  // Save handlers (PRESERVED EXACTLY from previous implementation)
  // -------------------------------------------------------------------------

  async function savePrivacy() {
    // NOTA (2026-05-23): `save_history` ya NO se persiste desde este
    // SaveBar. El toggle del historial vive en su propio flow
    // atomico (modal con CONFIRMAR + POST /users/me/history/toggle-
    // off|on en data_control_router.py) que ramifica por scope de
    // consentimiento. Aqui solo persistimos `checkin_enabled`, que
    // sigue siendo un toggle sin efectos secundarios sobre data.
    try {
      await updatePreferences({
        checkin_enabled: checkinEnabled,
      })
      addToast({ type: 'success', message: 'Cambios guardados' })
    } catch {
      addToast({ type: 'error', message: 'Error al guardar' })
    }
  }

  /**
   * Interceptor del toggle "Guardar historial". Disparo dos paths:
   *  - OFF (true → false): abre modal CONFIRMAR. El state solo
   *    cambia DESPUES de que el backend confirma el hide/delete.
   *  - ON  (false → true): llama directo al endpoint toggle-on
   *    (audit log + cambio de pref atomico). Sin confirmacion
   *    porque no es destructivo.
   */
  function handleSaveHistoryChange(next: boolean) {
    if (saveHistory === next) return // no-op
    if (!next) {
      // Going OFF — abrir modal de confirmacion.
      setShowHideHistory(true)
      return
    }
    // Going ON — llamada directa.
    apiClient
      .post('/users/me/history/toggle-on')
      .then(async () => {
        setSaveHistory(true)
        // code-review #8 (2026-05-23): re-hidratar el preferencesStore
        // para que la prop `save_history` global quede coherente con
        // el cambio. Sin esto, otros componentes que leen del store
        // ven el valor stale (false) hasta el próximo reload.
        try {
          const res = await apiClient.get('/preferences/me')
          usePreferencesStore.setState({ preferences: res.data })
        } catch {
          // No critico — el local state ya es correcto, el store se
          // re-hidrata en el proximo loadPreferences global.
        }
        addToast({
          type: 'success',
          message: 'Historial reactivado para conversaciones nuevas',
        })
      })
      .catch(() => {
        addToast({
          type: 'error',
          message: 'No pudimos reactivar el historial. Intenta de nuevo.',
        })
      })
  }

  async function handleConfirmHideHistory() {
    setHideHistorySubmitting(true)
    try {
      const res = await apiClient.post('/users/me/history/toggle-off')
      const data = res.data as {
        behavior: 'soft_hide' | 'hard_delete'
        affected_sessions: number
        deleted_messages: number
      }
      setSaveHistory(false)
      setShowHideHistory(false)
      addToast({
        type: 'success',
        message:
          data.behavior === 'hard_delete'
            ? `Tu historial se eliminó (${data.affected_sessions} conversación${data.affected_sessions === 1 ? '' : 'es'})`
            : `Tu historial se ocultó (${data.affected_sessions} conversación${data.affected_sessions === 1 ? '' : 'es'})`,
      })
      // Refrescar la lista en el sidebar para que las conversaciones
      // ocultas/eliminadas desaparezcan inmediatamente.
      await loadSessions()
      // code-review #8: re-hidratar el preferencesStore para que
      // save_history quede coherente con el backend en el resto de
      // componentes que lo consumen.
      try {
        const prefRes = await apiClient.get('/preferences/me')
        usePreferencesStore.setState({ preferences: prefRes.data })
      } catch {
        // ignored — local setSaveHistory ya es correcto
      }
    } catch {
      addToast({
        type: 'error',
        message: 'No pudimos procesar la acción. Intenta de nuevo.',
      })
    } finally {
      setHideHistorySubmitting(false)
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

  const currentSection =
    SECTIONS.find((s) => s.id === activeTab) ?? SECTIONS[0]

  // Modal pattern: when closed, render nothing. Matches SosPanel/ReportModal.
  if (!open) return null

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 55,
        background: 'rgba(26,17,16,0.45)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onClick={handleClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scale-in"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        style={{
          background: '#fff',
          width: 'min(100%, 1100px)',
          height: 'min(100%, 720px)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid var(--ink-200)',
        }}
      >
        {/* LEFT 280px sidebar */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            background: 'var(--ink-50)',
            borderRight: '1px solid var(--ink-200)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '20px 18px 14px',
              borderBottom: '1px solid var(--ink-200)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--ink-400)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Ajustes
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ink-900)',
                letterSpacing: '-0.015em',
              }}
            >
              Preferencias
            </div>
          </div>
          <nav
            aria-label="Secciones de configuracion"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {SECTIONS.map((s) => (
              <SettingsNavItem
                key={s.id}
                icon={s.icon}
                title={s.title}
                subtitle={s.subtitle}
                active={activeTab === s.id}
                onClick={() => setActiveTab(s.id)}
              />
            ))}
          </nav>
        </div>

        {/* RIGHT content area */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* Breadcrumb header */}
          <div
            style={{
              padding: '16px 28px',
              borderBottom: '1px solid var(--ink-200)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
              <span style={{ color: 'var(--ink-400)' }}>Ajustes</span>
              <span style={{ margin: '0 8px', color: 'var(--ink-300)' }}>
                /
              </span>
              <span style={{ color: 'var(--ink-800)', fontWeight: 600 }}>
                {currentSection.title}
              </span>
            </div>
            <CloseButton onClose={handleClose} />
          </div>

          {/* Content scrollable */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '28px 32px 32px',
            }}
          >
            <div style={{ maxWidth: 580 }}>
              {activeTab === 'privacy' && (
                <PrivacidadSection
                  saveHistory={saveHistory}
                  setSaveHistory={handleSaveHistoryChange}
                  checkinEnabled={checkinEnabled}
                  setCheckinEnabled={setCheckinEnabled}
                  onSave={savePrivacy}
                  onOpenArco={() => setShowArco(true)}
                  onRevokeConsent={() => setShowRevoke(true)}
                />
              )}

              {activeTab === 'accessibility' && (
                <AccesibilidadSection
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
                <VozSection
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

              {activeTab === 'account' && (
                <CuentaSection
                  email={user?.email ?? ''}
                  onChangePassword={() => setShowPassword(true)}
                  onDeleteAccount={() => setShowDelete(true)}
                />
              )}

              {activeTab === 'arco' && (
                <ArcoSection
                  onOpenExport={() => setShowArco(true)}
                  onRevokeConsent={() => setShowRevoke(true)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals — APIs preserved exactly (open/onClose + currentScope) */}
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
      <ConfirmHideHistoryModal
        open={showHideHistory}
        scope={consentScope}
        onCancel={() => {
          if (!hideHistorySubmitting) setShowHideHistory(false)
        }}
        onConfirm={handleConfirmHideHistory}
        submitting={hideHistorySubmitting}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header X close button (with hover state)
// ---------------------------------------------------------------------------

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClose}
      title="Cerrar (Esc)"
      aria-label="Cerrar ajustes"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: hover ? 'var(--ink-100)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--ink-500)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
    >
      <X size={18} />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Privacidad
// ---------------------------------------------------------------------------

interface PrivacidadSectionProps {
  saveHistory: boolean
  setSaveHistory: (v: boolean) => void
  checkinEnabled: boolean
  setCheckinEnabled: (v: boolean) => void
  onSave: () => void
  onOpenArco: () => void
  onRevokeConsent: () => void
}

function PrivacidadSection({
  saveHistory,
  setSaveHistory,
  checkinEnabled,
  setCheckinEnabled,
  onSave,
  onOpenArco,
  onRevokeConsent,
}: PrivacidadSectionProps) {
  return (
    <section>
      <SectionHeader
        title="Privacidad"
        desc="Controla que guarda Mabel y como lo usa."
      />
      <Toggle
        checked={saveHistory}
        onChange={setSaveHistory}
        label="Guardar historial de conversaciones"
        hint="Si esta activo, las conversaciones quedan en tu historial para revisitas y aporta al estudio."
      />
      <Toggle
        checked={checkinEnabled}
        onChange={setCheckinEnabled}
        label="Check-in emocional al inicio"
        hint="Pregunta opcional sobre tu estado emocional cuando inicias sesion."
      />

      <Card style={{ marginTop: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: 'var(--info-50)',
              color: 'var(--info-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={16} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Derechos ARCO</div>
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-600)',
            lineHeight: 1.5,
            margin: '4px 0 14px',
          }}
        >
          Ejerce tus derechos de Acceso, Rectificacion, Cancelacion y Oposicion
          sobre tus datos personales de acuerdo con la Ley 1581 de 2012.
        </p>
        <button
          type="button"
          onClick={onOpenArco}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 16px',
            background: '#fff',
            color: 'var(--info-600)',
            border: '1px solid var(--info-600)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <Info size={14} /> Solicitar datos ARCO
        </button>
      </Card>

      <Card
        style={{
          marginTop: 16,
          background: 'var(--warn-50)',
          borderColor: 'var(--warn-200)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              background: '#fff',
              color: 'var(--warn-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldOff size={16} />
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            Consentimiento informado
          </div>
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-700)',
            lineHeight: 1.5,
            margin: '4px 0 14px',
          }}
        >
          Puedes revocar tu consentimiento en cualquier momento. Esto eliminara
          tus datos y finalizara tu acceso al servicio.
        </p>
        <button
          type="button"
          onClick={onRevokeConsent}
          style={{
            padding: '8px 14px',
            border: '1px solid var(--warn-600)',
            color: 'var(--warn-700)',
            background: 'transparent',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Revocar consentimiento
        </button>
      </Card>

      <SaveBar onClick={onSave} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Accesibilidad
// ---------------------------------------------------------------------------

interface AccesibilidadSectionProps {
  contrast: boolean
  setContrast: (v: boolean) => void
  fontSize: 'small' | 'normal' | 'large'
  setFontSize: (v: 'small' | 'normal' | 'large') => void
  subtitles: boolean
  setSubtitles: (v: boolean) => void
  onSave: () => void
}

function AccesibilidadSection({
  contrast,
  setContrast,
  fontSize,
  setFontSize,
  subtitles,
  setSubtitles,
  onSave,
}: AccesibilidadSectionProps) {
  return (
    <section>
      <SectionHeader
        title="Accesibilidad"
        desc="Ajusta la presentacion visual y auditiva."
      />
      <Toggle
        checked={contrast}
        onChange={setContrast}
        label="Alto contraste"
        hint="Mejora la visibilidad de textos y elementos."
      />
      <div style={{ paddingTop: 22 }}>
        <SettingsField
          label="Tamano de fuente"
          hint="Afecta el cuerpo del texto. Persiste entre sesiones."
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
        </SettingsField>
      </div>
      <Toggle
        checked={subtitles}
        onChange={setSubtitles}
        label="Subtitulos TTS"
        hint="Resaltado word-by-word durante reproduccion de voz."
      />
      <SaveBar onClick={onSave} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Voz
// ---------------------------------------------------------------------------

interface VozSectionProps {
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

function VozSection({
  ttsEnabled,
  setTtsEnabled,
  ttsVoice,
  setTtsVoice,
  chatMode,
  setChatMode,
  previewPlaying,
  previewVoice,
  onSave,
}: VozSectionProps) {
  return (
    <section>
      <SectionHeader
        title="Voz"
        desc="Configura la sintesis de voz y el modo de interaccion."
      />
      <Toggle
        checked={ttsEnabled}
        onChange={setTtsEnabled}
        label="TTS activado"
        hint="Reproducir respuestas con voz sintetizada. Puedes silenciar puntualmente en el chat."
      />
      <div style={{ paddingTop: 22 }}>
        <SettingsField
          label="Voz del asistente"
          hint="Elige la voz para reproduccion. Usa Preview para escuchar un fragmento breve."
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
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
            <PrimaryButton onClick={previewVoice} disabled={previewPlaying}>
              {previewPlaying ? 'Reproduciendo...' : 'Preview'}
            </PrimaryButton>
          </div>
        </SettingsField>

        <SettingsField
          label="Modo de interaccion"
          hint="Chat clasico o avatar 3D animado."
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
        </SettingsField>
      </div>
      <SaveBar onClick={onSave} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Cuenta
// ---------------------------------------------------------------------------

interface CuentaSectionProps {
  email: string
  onChangePassword: () => void
  onDeleteAccount: () => void
}

function CuentaSection({
  email,
  onChangePassword,
  onDeleteAccount,
}: CuentaSectionProps) {
  return (
    <section>
      <SectionHeader title="Cuenta" desc="Seguridad y eliminacion." />

      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--ink-900)',
          marginBottom: 12,
        }}
      >
        Cambiar contrasena
      </div>
      <PrimaryButton
        onClick={onChangePassword}
        icon={<Lock size={15} />}
      >
        Cambiar contrasena
      </PrimaryButton>

      <div style={{ marginTop: 28 }}>
        <SettingsField
          label="Email"
          hint="No se puede cambiar el email asociado a tu cuenta."
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'var(--ink-50)',
              border: '1px solid var(--ink-200)',
              borderRadius: 10,
              color: 'var(--ink-700)',
              fontSize: 14,
            }}
          >
            <Mail size={16} style={{ color: 'var(--ink-400)' }} />
            <span>{email || '-'}</span>
          </div>
        </SettingsField>
      </div>

      {/* Danger zone */}
      <div
        style={{
          marginTop: 36,
          padding: 20,
          border: '1px solid var(--danger-200)',
          borderRadius: 14,
          background: 'var(--danger-50)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 6,
          }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--danger-600)' }} />
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--danger-700)',
            }}
          >
            Zona de peligro
          </div>
        </div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-700)',
            lineHeight: 1.5,
            margin: '0 0 14px',
          }}
        >
          Estas acciones son irreversibles. Procede con precaucion.
        </p>
        <button
          type="button"
          onClick={onDeleteAccount}
          style={{
            padding: '9px 16px',
            border: '1px solid var(--danger-600)',
            color: 'var(--danger-600)',
            background: '#fff',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Trash2 size={14} /> Eliminar cuenta
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// ARCO (Mis datos)
// ---------------------------------------------------------------------------

interface ArcoSectionProps {
  onOpenExport: () => void
  onRevokeConsent: () => void
}

function ArcoSection({ onOpenExport, onRevokeConsent }: ArcoSectionProps) {
  return (
    <section>
      <SectionHeader
        title="Mis datos (ARCO)"
        desc="Ley 1581 de 2012 - derecho a Acceso, Rectificacion, Cancelacion y Oposicion."
      />
      <p
        style={{
          fontSize: 14,
          color: 'var(--ink-600)',
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        Segun la Ley 1581 de 2012, tienes derecho a acceder, rectificar,
        cancelar y oponerte al tratamiento de tus datos personales. Descarga tu
        informacion en formato JSON o CSV para revisarla.
      </p>
      <PrimaryButton onClick={onOpenExport}>Ver mis datos</PrimaryButton>

      <div style={{ marginTop: 36 }}>
        <Card
          style={{
            background: 'var(--warn-50)',
            borderColor: 'var(--warn-200)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <Shield size={16} style={{ color: 'var(--warn-600)' }} />
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>
              Consentimiento informado
            </div>
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-700)',
              lineHeight: 1.5,
              margin: '4px 0 14px',
            }}
          >
            Puedes revocar tu consentimiento en cualquier momento. Esto
            eliminara tus datos y finalizara tu acceso al servicio.
          </p>
          <button
            type="button"
            onClick={onRevokeConsent}
            style={{
              padding: '8px 14px',
              border: '1px solid var(--warn-600)',
              color: 'var(--warn-700)',
              background: 'transparent',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Revocar consentimiento
          </button>
        </Card>
      </div>
    </section>
  )
}
