import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'

const SUGGESTIONS = [
  { emoji: '\uD83D\uDE13', text: 'Estoy estresado por los parciales' },
  { emoji: '\uD83E\uDDD8', text: 'Tecnicas de relajacion' },
  { emoji: '\uD83D\uDE34', text: 'No puedo dormir bien' },
  { emoji: '\uD83D\uDCAC', text: 'Quiero hablar de como me siento' },
]

export default function Home() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const createSession = useChatStore((s) => s.createSession)
  const addToast = useToastStore((s) => s.addToast)

  async function handleSuggestionClick(text: string) {
    try {
      const result = await createSession(text)
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
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        Hola, {user?.display_name || 'estudiante'}!
      </h1>
      <p className="text-text-primary/60 mb-8">En que te puedo ayudar hoy?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={() => handleSuggestionClick(s.text)}
            className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary/30 hover:shadow-sm transition-all text-left"
          >
            <span className="text-2xl">{s.emoji}</span>
            <span className="text-sm text-text-primary">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
