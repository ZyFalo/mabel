import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useChatStore } from '../stores/chatStore'
import { SkeletonChat } from '../components/ui/Skeleton'

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'Menos de 1 min'
  return `${minutes} min`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { loadSession, messages, loadMessages, isLoadingMessages } = useChatStore()

  interface SessionData {
    started_at: string
    ended_at: string | null
    checkin_payload?: { mood?: number; sleep?: number; focus?: string; note?: string } | null
  }

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    loadSession(id)
      .then((s) => {
        if (!s.ended_at) {
          navigate(`/session/${id}/chat`, { replace: true })
          return
        }
        setSession(s as unknown as SessionData)
        return loadMessages(id)
      })
      .catch(() => navigate('/403', { replace: true }))
      .finally(() => setLoading(false))
  }, [id, loadSession, loadMessages, navigate])

  if (loading || !session) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <SkeletonChat />
      </div>
    )
  }

  const checkin = session.checkin_payload

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-text-primary/40 mb-4">
        <button onClick={() => navigate('/home')} className="hover:text-text-primary">Home</button>
        <span>&gt;</span>
        <span className="text-text-primary/60">
          Sesion {formatDateTime(session.started_at as string)}
        </span>
      </nav>

      {/* Metadata */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-text-primary/40 text-xs">Inicio</p>
            <p className="text-text-primary">{formatDateTime(session.started_at as string)}</p>
          </div>
          <div>
            <p className="text-text-primary/40 text-xs">Fin</p>
            <p className="text-text-primary">{formatDateTime(session.ended_at as string)}</p>
          </div>
          <div>
            <p className="text-text-primary/40 text-xs">Duracion</p>
            <p className="text-text-primary">
              {formatDuration(session.started_at as string, session.ended_at as string)}
            </p>
          </div>
        </div>
      </div>

      {/* Check-in data */}
      {checkin && (
        <div className="bg-blue-50 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-2">Check-in</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            {checkin.mood !== undefined && (
              <div>
                <p className="text-text-primary/40 text-xs">Animo</p>
                <p className="text-text-primary font-medium">{checkin.mood}/10</p>
              </div>
            )}
            {checkin.sleep !== undefined && (
              <div>
                <p className="text-text-primary/40 text-xs">Sueno</p>
                <p className="text-text-primary">{checkin.sleep}h</p>
              </div>
            )}
            {checkin.focus && (
              <div>
                <p className="text-text-primary/40 text-xs">Foco</p>
                <p className="text-text-primary">{checkin.focus}</p>
              </div>
            )}
            {checkin.note && (
              <div className="col-span-full">
                <p className="text-text-primary/40 text-xs">Notas</p>
                <p className="text-text-primary text-sm">{checkin.note}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conversation */}
      <h3 className="text-sm font-semibold text-text-primary mb-3">Conversacion</h3>
      {isLoadingMessages ? (
        <SkeletonChat />
      ) : messages.length === 0 ? (
        <p className="text-sm text-text-primary/40">No hay mensajes en esta sesion.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? 'bg-primary/10 text-text-primary rounded-br-md'
                      : 'bg-gray-100 text-text-primary rounded-bl-md'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-[10px] text-text-primary/40">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={() => navigate('/home')}
          className="px-4 py-2 text-sm text-text-primary/60 hover:text-text-primary transition-colors"
        >
          Volver
        </button>
        <button
          disabled
          title="Disponible proximamente"
          className="px-4 py-2 text-sm text-danger/50 cursor-not-allowed"
        >
          Eliminar sesion
        </button>
      </div>
    </div>
  )
}
