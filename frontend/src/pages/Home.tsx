import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Heart, Moon, MessageCircle, Sparkles } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'
import Composer from '../components/chat/Composer'

type SuggestionAccent = 'rose' | 'amber' | 'indigo' | 'emerald'

interface Suggestion {
  text: string
  icon: React.ReactNode
  accent: SuggestionAccent
}

const SUGGESTIONS: Suggestion[] = [
  { text: 'Estoy estresado por los parciales', icon: <BookOpen size={15} />, accent: 'amber' },
  { text: 'Tecnicas de relajacion', icon: <Heart size={15} />, accent: 'rose' },
  { text: 'No puedo dormir bien', icon: <Moon size={15} />, accent: 'indigo' },
  { text: 'Quiero hablar de como me siento', icon: <MessageCircle size={15} />, accent: 'emerald' },
]

const ACCENT_CHIP: Record<SuggestionAccent, string> = {
  rose: 'bg-rose-100 text-rose-700 border-rose-200/60',
  amber: 'bg-amber-100 text-amber-800 border-amber-200/60',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200/60',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200/60',
}

function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos dias'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

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

  const timeGreeting = useMemo(() => getTimeGreeting(), [])

  async function launchSession(topicHint?: string) {
    if (creating) return
    setCreating(true)
    try {
      const result = await createSession(topicHint)
      if (result.previous_session_closed) {
        addToast({ type: 'info', message: 'Sesion anterior finalizada automaticamente' })
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

  function handleSuggestionClick(text: string) {
    void launchSession(text)
  }

  function handleComposerSend() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void launchSession(text)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 pt-8">
      <div className="max-w-2xl w-full fade-in">
        {/* Logo / brand mark */}
        <div className="flex justify-center mb-7">
          <div
            className="
              w-12 h-12 rounded-full
              flex items-center justify-center
              bg-[var(--bg-elevated)] border border-[var(--border)]
              text-[var(--accent)]
              shadow-sm
            "
            aria-hidden="true"
          >
            <Sparkles size={20} />
          </div>
        </div>

        {/* Greeting */}
        <h1
          className="
            font-display italic font-light
            text-[34px] sm:text-[40px]
            text-center text-[var(--text-strong)]
            mb-10 leading-tight tracking-tight
          "
        >
          {timeGreeting},{' '}
          <span className="text-[var(--accent)]">{firstName}</span>
        </h1>

        {/* Composer (no mic/mute on welcome — no session yet) */}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={handleComposerSend}
          disabled={creating}
          placeholder="Cuentame, como te sientes hoy..."
          showHint={false}
        />

        {/* Suggestions grid */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s.text}
              onClick={() => handleSuggestionClick(s.text)}
              disabled={creating}
              className="
                group/sg
                flex items-start gap-3
                p-3.5 rounded-xl
                border border-[var(--border)]
                bg-[var(--bg-elevated)]/60
                hover:bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]
                transition-all duration-200
                text-left
                disabled:opacity-50 disabled:cursor-not-allowed
                fade-up
              "
              style={{ animationDelay: `${120 + i * 50}ms` }}
            >
              <span
                className={`
                  shrink-0 w-7 h-7 rounded-lg
                  flex items-center justify-center
                  border ${ACCENT_CHIP[s.accent]}
                  transition-transform duration-200
                  group-hover/sg:scale-110
                `}
                aria-hidden="true"
              >
                {s.icon}
              </span>
              <span className="text-[13.5px] text-[var(--text)] leading-snug pt-0.5">
                {s.text}
              </span>
            </button>
          ))}
        </div>

        {/* Subtle footnote */}
        <p className="text-center text-[11px] text-[var(--text-faint)] mt-8">
          Mabel es una asistente de psicoeducacion. No reemplaza atencion profesional.
        </p>
      </div>
    </div>
  )
}
