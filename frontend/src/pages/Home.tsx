import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Heart,
  MessageCircle,
  Brain,
  Sparkles,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
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

  // `pendingMessage` is the text the user typed (or a chip prompt they
  // clicked) BEFORE a session existed. We forward it via router state so
  // Chat.tsx can send it as the user's first message. We deliberately do
  // NOT pass it as `topic_hint` — that would turn the message into just a
  // session title and the user's words would never reach Mabel.
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
      if (result.checkin_opt_in) {
        navigate(`/session/${result.id}/checkin`, { state })
      } else {
        navigate(`/session/${result.id}/chat`, { state })
      }
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

        {/* Composer — no mic/mute on Home (no session yet) */}
        <div style={{ textAlign: 'left' }}>
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={handleComposerSend}
            disabled={creating}
            autoFocus
            placeholder="Cuéntame qué necesitas hoy…"
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
