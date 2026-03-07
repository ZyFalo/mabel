import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'
import { SkeletonCard } from '../components/ui/Skeleton'

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'Menos de 1 minuto'
  if (minutes === 1) return '1 minuto'
  return `${minutes} minutos`
}

export default function SessionEnd() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { loadSession, messages, loadMessages, createSession } = useChatStore()
  const addToast = useToastStore((s) => s.addToast)

  const [session, setSession] = useState<{
    started_at: string; ended_at: string | null; checkin_payload?: { mood?: number } | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      loadSession(id).then((s) => setSession(s as typeof session)),
      loadMessages(id),
    ]).finally(() => setLoading(false))
  }, [id, loadSession, loadMessages])

  async function handleNewSession() {
    try {
      const result = await createSession()
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

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <SkeletonCard />
      </div>
    )
  }

  const mood = session?.checkin_payload?.mood

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="max-w-md w-full text-center">
        <span className="text-5xl block mb-4">{'\uD83C\uDF1F'}</span>
        <h1 className="text-xl font-bold text-text-primary mb-2">
          Gracias por conversar conmigo hoy
        </h1>
        <p className="text-sm text-text-primary/60 mb-6">
          Recuerda que estoy aqui cuando me necesites. Cuidate mucho.
        </p>

        {/* Session summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Resumen de sesion</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-primary">
                {session?.started_at && session?.ended_at
                  ? formatDuration(session.started_at as string, session.ended_at as string)
                  : '-'}
              </p>
              <p className="text-xs text-text-primary/40">Duracion</p>
            </div>
            <div>
              <p className="text-lg font-bold text-primary">{messages.length}</p>
              <p className="text-xs text-text-primary/40">Mensajes</p>
            </div>
            <div>
              <p className="text-lg font-bold text-primary">
                {mood !== undefined ? `${mood}/10` : '-'}
              </p>
              <p className="text-xs text-text-primary/40">Animo</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleNewSession}
            className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Nueva sesion
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full py-2.5 text-sm text-text-primary/60 hover:text-text-primary transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
