import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

  async function launchSession(topicHint?: string) {
    if (creating) return
    setCreating(true)
    try {
      const result = await createSession(topicHint)
      if (result.previous_session_closed) {
        addToast({
          type: 'info',
          message: 'Sesion anterior finalizada automaticamente',
        })
      }
      if (result.checkin_opt_in) {
        navigate(`/session/${result.id}/checkin`)
      } else {
        navigate(`/session/${result.id}/chat`)
      }
    } catch {
      addToast({ type: 'error', message: 'Error al crear sesion' })
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
        padding: '32px 24px',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: 720, textAlign: 'center' }}>
        {/* Mabel M avatar with brand shadow */}
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--mabel-600)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 23,
            margin: '0 auto 20px',
            boxShadow: 'var(--shadow-brand)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.01em',
          }}
        >
          M
        </div>

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
          Hola, {firstName}.
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
            Conversaciones cifradas · Mabel no reemplaza la atención profesional
          </span>
        </div>
      </div>
    </div>
  )
}
