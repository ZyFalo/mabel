import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Heart,
  MessageCircle,
  Brain,
  Sparkles,
  Lock,
  ClipboardList,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { usePreferencesStore } from '../stores/preferencesStore'
// Pre-warm Mabel-Gemma4 desde Home — el flow más común es Home → composer
// → /chat con pendingMessage, y si esperamos al mount de Chat para
// dispararlo, el primer mensaje ya está en vuelo cuando arranca el
// prewarm. Aquí da head-start real al cold start de Modal.
import useLlmPrewarm from '../hooks/useLlmPrewarm'
import { useToastStore } from '../stores/toastStore'
import Composer from '../components/chat/Composer'
import SuggestionChip from '../components/chat/SuggestionChip'
import UmbAvatar from '../components/ui/UmbAvatar'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'
import { getTimedGreeting } from '../utils/greetings'

interface Suggestion {
  icon: LucideIcon
  label: string
  prompt: string
}

const SUGGESTIONS: Suggestion[] = [
  {
    icon: Heart,
    label: 'Cómo me siento hoy',
    prompt: 'Quiero hablarte sobre cómo me he sentido hoy.',
  },
  {
    icon: MessageCircle,
    label: 'Quiero hablar de algo',
    prompt: 'Tengo algo en mente y necesito conversarlo.',
  },
  {
    icon: Brain,
    label: 'Tengo estrés académico',
    prompt: 'Estoy con mucho estrés por temas académicos.',
  },
  {
    icon: Sparkles,
    label: 'Necesito motivación',
    prompt: 'Hoy necesito un poco de motivación.',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const user = useAuthStore((s) => s.user)
  const createSession = useChatStore((s) => s.createSession)
  const addToast = useToastStore((s) => s.addToast)
  // Pre-warm fire-and-forget: si Modal está cold, este ping arranca
  // el cold start en paralelo a que la persona lee el saludo y elige
  // su sugerencia. No usamos `status` aquí porque Home no muestra
  // banner — el indicador vive en Chat/Voice cuando ya estamos
  // dentro de la sesión.
  useLlmPrewarm()

  // Read the user's check-in preference so the "Llenar check-in" CTA
  // only renders for students who have it enabled. If `checkin_enabled`
  // is false (toggled off in Settings) the card disappears and the
  // Home reverts to its pre-feature look — input-first, no nudge.
  const checkinEnabled = usePreferencesStore(
    (s) => s.preferences?.checkin_enabled ?? false,
  )

  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)

  const firstName = useMemo(() => {
    const full = user?.display_name?.trim()
    if (!full) return 'estudiante'
    return full.split(/\s+/)[0]
  }, [user?.display_name])

  // Random greeting picked once per mount and stabilised. Browser time
  // determines the bucket (morning/afternoon/evening).
  const greetingText = useMemo(() => getTimedGreeting(firstName), [firstName])

  // Composer / suggestion chip path. Crea la sesión inmediatamente
  // (caso simple atómico desde la perspectiva del usuario: clickear
  // enviar → tener sesión + primer mensaje) y entra al chat con
  // `pendingMessage` en router state para que Chat.tsx lo dispare.
  //
  // Plan B + lazy session (2026-05-23): NO se intercepta para
  // check-in aunque la preferencia `checkin_enabled` esté on. Si el
  // estudiante quiere check-in, usa el botón explícito de arriba que
  // navega a /checkin/new (otro flujo lazy que no crea sesión hasta
  // submit). Esto respeta autonomía y evita el "obligatorio
  // encubierto" del comportamiento previo.
  async function launchSession(pendingMessage?: string) {
    if (creating) return
    setCreating(true)
    try {
      const result = await createSession()
      if (result.previous_session_closed) {
        addToast({
          type: 'info',
          message: 'Sesión anterior finalizada automáticamente',
        })
      }
      const state = pendingMessage ? { pendingMessage } : undefined
      navigate(`/session/${result.id}/chat`, { state })
    } catch {
      addToast({ type: 'error', message: 'Error al crear sesión' })
    } finally {
      setCreating(false)
    }
  }

  function handleSuggestionClick(s: Suggestion) {
    void launchSession(s.prompt)
  }

  function handleComposerSend() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void launchSession(text)
  }

  function handleCheckinStart() {
    // Lazy session creation (2026-05-23): el botón "Llenar check-in"
    // ya NO crea la sesión inmediatamente. Navegamos a /checkin/new
    // (sin id) donde el formulario opera en modo draft y solo crea
    // la sesión al submit (atómico: sesión + check-in en una sola
    // transacción) o vuelve al Home si se abandona. Esto evita que
    // cada click en el botón genere una sesión huérfana en BD.
    navigate('/checkin/new')
  }

  return (
    <div
      className="fade-in"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      <SosButton variant="floating" onClick={openCrisis} />

      {/* Transición Home → Chat: overlay con avatar pulsante mientras
          el createSession está en vuelo. Cubre el gap visual entre el
          click "Enviar" y el primer render del Chat, evitando la
          sensación de "freeze" antes del navigate. El Chat luego
          continúa la misma cadena visual con el typing indicator
          "Mabel está pensando…" (ver Chat.tsx `awaitingFirstResponse`).
          Las animaciones `overlay-in` + `soft-breath` viven en
          `index.css` bajo `@media (prefers-reduced-motion: no-preference)`,
          así que usuarios con motion-reduce ven el overlay aparecer
          instantáneo sin animación — accesibilidad WCAG 2.3.3. */}
      {creating && (
        <div
          className="overlay-in"
          role="status"
          aria-live="polite"
          aria-label="Conectando con Mabel"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(250, 248, 247, 0.78)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            gap: 14,
            pointerEvents: 'auto',
          }}
        >
          <div className="soft-breath" style={{ display: 'inline-flex' }}>
            <UmbAvatar size={72} />
          </div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--ink-600)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
              letterSpacing: '0.005em',
            }}
          >
            Conectando con Mabel…
          </p>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 640, textAlign: 'center' }}>
        {/* Mabel brand mark — escudo UMB rojo, sin fondo ni wrapper */}
        <UmbAvatar
          size={72}
          style={{ margin: '0 auto 20px' }}
        />

        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1.15,
            color: 'var(--ink-900)',
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {greetingText}
        </h1>

        <p
          style={{
            fontSize: 16,
            color: 'var(--ink-500)',
            margin: '0 auto 32px',
            maxWidth: 540,
            lineHeight: 1.55,
          }}
        >
          Soy Mabel, tu asistente de bienestar en la UMB. Este es un espacio
          seguro y confidencial. ¿Por dónde quieres empezar?
        </p>

        {/* Check-in CTA — visible solo si el estudiante tiene la
            preferencia activa. Plan B (2026-05-23): el formulario es
            una opción ofrecida, no una intercepción. El estudiante
            puede llenar el check-in para abrir con contexto
            estructurado, o escribir directamente abajo si prefiere
            chatear sin formulario. Si `checkin_enabled` está off en
            Settings, este bloque desaparece.

            Paleta UMB: fondo cream warm (`--ink-50`), borde sutil
            (`--ink-200`), ícono en primary rojo. Sin azules — la
            primera versión cayó al cyan default de Tailwind porque
            `--accent-50` no existe en el design system. */}
        {checkinEnabled && (
          <button
            type="button"
            onClick={handleCheckinStart}
            disabled={creating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '14px 16px',
              marginBottom: 12,
              borderRadius: 12,
              border: '1px solid var(--ink-200)',
              background: 'var(--ink-50)',
              cursor: creating ? 'not-allowed' : 'pointer',
              opacity: creating ? 0.6 : 1,
              textAlign: 'left',
              transition: 'background-color 0.15s ease, border-color 0.15s ease',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              if (creating) return
              e.currentTarget.style.background = 'var(--ink-100)'
              e.currentTarget.style.borderColor = 'var(--mabel-600)'
            }}
            onMouseLeave={(e) => {
              if (creating) return
              e.currentTarget.style.background = 'var(--ink-50)'
              e.currentTarget.style.borderColor = 'var(--ink-200)'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--mabel-600)',
                color: '#fff',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <ClipboardList size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ink-900)',
                  lineHeight: 1.3,
                }}
              >
                Empezar con un check-in breve
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--ink-500)',
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                Tres preguntas suaves para que comencemos por donde lo estés
                sintiendo hoy.
              </span>
            </span>
            <ArrowRight
              size={18}
              style={{ color: 'var(--ink-400)', flexShrink: 0 }}
              aria-hidden="true"
            />
          </button>
        )}

        {/* Composer — no mic/mute on Home (no session yet) */}
        <div style={{ textAlign: 'left' }}>
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={handleComposerSend}
            disabled={creating}
            autoFocus
            placeholder={
              checkinEnabled
                ? '…o cuéntame directamente lo que tengas en mente'
                : 'Cuéntame lo que tengas en mente…'
            }
            showHint={false}
            compact
          />
        </div>

        {/* 4 suggestion chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
            marginTop: 20,
          }}
        >
          {SUGGESTIONS.map((s) => (
            <SuggestionChip
              key={s.label}
              icon={s.icon}
              label={s.label}
              onClick={() => handleSuggestionClick(s)}
              disabled={creating}
            />
          ))}
        </div>

        {/* Lock disclaimer */}
        <div
          style={{
            marginTop: 28,
            fontSize: 12,
            color: 'var(--ink-400)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Lock size={12} />
          <span>
            Conversaciones privadas · Mabel no reemplaza la atención profesional
          </span>
        </div>
      </div>
    </div>
  )
}
