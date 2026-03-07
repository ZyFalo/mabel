import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { SkeletonText } from '../ui/Skeleton'

interface SidebarProps {
  open: boolean
}

interface SessionItem {
  id: string
  started_at: string
  ended_at: string | null
  topic_hint: string | null
}

function groupByDate(sessions: SessionItem[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: { label: string; items: SessionItem[] }[] = [
    { label: 'HOY', items: [] },
    { label: 'AYER', items: [] },
    { label: 'ESTA SEMANA', items: [] },
    { label: 'ANTERIORES', items: [] },
  ]

  for (const s of sessions) {
    const d = new Date(s.started_at)
    if (d >= today) groups[0].items.push(s)
    else if (d >= yesterday) groups[1].items.push(s)
    else if (d >= weekAgo) groups[2].items.push(s)
    else groups[3].items.push(s)
  }

  return groups.filter((g) => g.items.length > 0)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export default function Sidebar({ open }: SidebarProps) {
  const navigate = useNavigate()
  const params = useParams()
  const user = useAuthStore((s) => s.user)
  const { sessions, loadSessions, createSession, isLoadingSessions, saveHistoryEnabled } = useChatStore()
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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

  function handleSessionClick(s: SessionItem) {
    if (s.ended_at) {
      navigate(`/session/${s.id}/detail`)
    } else {
      navigate(`/session/${s.id}/chat`)
    }
  }

  const maskedEmail = user?.email
    ? user.email.replace(/^(.).*(@.*)$/, '$1***$2')
    : ''

  const groups = groupByDate(sessions as SessionItem[])

  return (
    <aside
      className={`${open ? 'w-[220px]' : 'w-0 overflow-hidden'} bg-accent shrink-0 flex flex-col transition-all duration-200 h-full`}
    >
      <div className="flex flex-col h-full p-3 gap-3">
        {/* New session button */}
        <button
          onClick={handleNewSession}
          className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Nueva sesion
        </button>

        {/* Session history */}
        <div className="flex-1 overflow-y-auto">
          {isLoadingSessions ? (
            <div className="space-y-3 px-1">
              <SkeletonText />
              <SkeletonText />
            </div>
          ) : !saveHistoryEnabled ? (
            <div className="text-white/50 text-xs px-1 py-2">
              <p className="mb-1">Historial desactivado</p>
              <button
                onClick={() => navigate('/settings')}
                className="text-white/70 underline hover:text-white text-xs"
              >
                Ir a Preferencias
              </button>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-white/40 text-xs px-1 py-2">Sin sesiones</p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wider px-1 mb-1">
                  {group.label}
                </p>
                {group.items.map((s) => {
                  const isActive = !s.ended_at
                  const isCurrent = params.id === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSessionClick(s)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                        isCurrent
                          ? 'bg-white/20 text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="block truncate">
                        {s.topic_hint || `Sesion ${formatDate(s.started_at)}`}
                      </span>
                      {isActive && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-primary text-white text-[10px] rounded font-medium">
                          En curso
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom section */}
        <div className="border-t border-white/10 pt-3">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-2 text-white/60 hover:text-white text-xs transition-colors w-full"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Ajustes
          </button>
          <div className="mt-2 text-white/40 text-[10px]">
            <p className="truncate">{user?.display_name}</p>
            <p className="truncate">{maskedEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
