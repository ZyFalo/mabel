import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PanelLeft,
  Plus,
  Search,
  FolderClosed,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { usePreferencesStore } from '../../stores/preferencesStore'
import { useToastStore } from '../../stores/toastStore'
import { SkeletonText } from '../ui/Skeleton'
import CollapsedSidebar from './CollapsedSidebar'
import UserMenu from './UserMenu'

interface StudentSidebarV3Props {
  open: boolean
  onToggle: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  /** When true, sidebar renders as mobile drawer (always 272px, fixed position). */
  mobileDrawer?: boolean
}

interface SessionItem {
  id: string
  started_at: string
  ended_at: string | null
  topic_hint: string | null
}

/**
 * Group sessions into temporal buckets (most-recent first).
 * Buckets: Hoy, Ayer, Esta semana, Hace 30 dias, Anteriores.
 */
function groupByDate(sessions: SessionItem[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: { label: string; items: SessionItem[] }[] = [
    { label: 'Hoy', items: [] },
    { label: 'Ayer', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Hace 30 dias', items: [] },
    { label: 'Anteriores', items: [] },
  ]

  for (const s of sessions) {
    const d = new Date(s.started_at)
    if (d >= today) groups[0].items.push(s)
    else if (d >= yesterday) groups[1].items.push(s)
    else if (d >= weekAgo) groups[2].items.push(s)
    else if (d >= monthAgo) groups[3].items.push(s)
    else groups[4].items.push(s)
  }

  return groups.filter((g) => g.items.length > 0)
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return '?'
  const parts = source.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

export default function StudentSidebarV3({
  open,
  onToggle,
  onNewChat,
  onOpenSettings,
  mobileDrawer = false,
}: StudentSidebarV3Props) {
  const navigate = useNavigate()
  const params = useParams()
  const user = useAuthStore((s) => s.user)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const profileButtonRef = useRef<HTMLButtonElement | null>(null)
  const { sessions, loadSessions, createSession, isLoadingSessions, saveHistoryEnabled } =
    useChatStore()
  const preferences = usePreferencesStore((s) => s.preferences)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // `preferences.save_history` takes precedence when loaded; fallback to chatStore mirror.
  const historyEnabled =
    preferences && typeof preferences.save_history === 'boolean'
      ? preferences.save_history
      : saveHistoryEnabled

  async function handleNewSession() {
    if (onNewChat) {
      onNewChat()
      return
    }
    try {
      const result = await createSession()
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
    }
  }

  function handleSessionClick(s: SessionItem) {
    if (s.ended_at) {
      navigate(`/session/${s.id}/detail`)
    } else {
      navigate(`/session/${s.id}/chat`)
    }
  }

  function handleSettings() {
    if (onOpenSettings) {
      onOpenSettings()
      return
    }
    navigate('/settings')
  }

  // Collapsed (only on non-mobile flow). Mobile drawer always renders the
  // expanded variant — visibility is controlled by the parent via translate.
  if (!open && !mobileDrawer) {
    return (
      <aside
        className="h-full shrink-0 overflow-hidden border-r border-[var(--border)] transition-[width] duration-300 ease-out"
        style={{ width: 56 }}
      >
        <CollapsedSidebar
          onExpand={onToggle}
          onNewChat={handleNewSession}
          onOpenSettings={handleSettings}
          user={user}
        />
      </aside>
    )
  }

  const groups = groupByDate(sessions as SessionItem[])
  const initials = getInitials(user?.display_name, user?.email)
  const roleLabel = user?.role === 'admin' ? 'Administrador' : 'Estudiante'

  const wrapperBase = mobileDrawer
    ? 'h-full w-[272px] bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col overflow-hidden'
    : 'h-full shrink-0 bg-[var(--bg-sidebar)] border-r border-[var(--border)] flex flex-col overflow-hidden transition-[width] duration-300 ease-out'

  return (
    <aside
      className={wrapperBase}
      style={mobileDrawer ? undefined : { width: 272 }}
    >
      {/* Header — logo + toggle */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <span
          className="font-display text-[19px] font-medium tracking-tight text-[var(--text-strong)] select-none"
          style={{ fontVariationSettings: '"opsz" 36' }}
        >
          Mabel
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Colapsar sidebar"
          title="Colapsar sidebar (Cmd+B)"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* Top actions */}
      <div className="px-3 pb-2 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={handleNewSession}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-[var(--text-strong)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <span
            className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
            aria-hidden
          >
            <Plus size={12} className="text-[var(--accent)]" />
          </span>
          Nueva conversacion
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-[var(--text-muted)] hover:text-[var(--text-strong)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <Search size={14} className="ml-0.5" />
          Buscar chats
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3">
        {!historyEnabled ? (
          <div className="px-2 py-6 flex flex-col items-start gap-2">
            <div
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]"
              aria-hidden
            >
              <FolderClosed size={16} />
            </div>
            <p className="text-[12.5px] font-medium text-[var(--text-strong)] leading-tight">
              Historial desactivado
            </p>
            <p className="text-[11.5px] text-[var(--text-faint)] leading-snug">
              Tus conversaciones no se guardan.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="text-[11.5px] font-medium text-[var(--accent)] hover:underline mt-0.5"
            >
              Activar en preferencias
            </button>
          </div>
        ) : isLoadingSessions && sessions.length === 0 ? (
          <div className="space-y-3 px-1 pt-1">
            <SkeletonText />
            <SkeletonText />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-[12px] text-[var(--text-faint)] px-2 py-3">
            Aun no tienes conversaciones.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--text-faint)] font-medium px-2 mb-1.5">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((s) => {
                  const isCurrent = params.id === s.id
                  const isActive = !s.ended_at
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSessionClick(s)}
                      className={`group/row w-full text-left px-2.5 py-1.5 rounded-md text-[13px] transition-colors flex items-center gap-2 ${
                        isCurrent
                          ? 'bg-[var(--bg-active)] text-[var(--text-strong)]'
                          : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-strong)]'
                      }`}
                    >
                      <span className="truncate flex-1">
                        {s.topic_hint || `Sesion ${formatTime(s.started_at)}`}
                      </span>
                      {isActive && (
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)]"
                          aria-label="Sesion en curso"
                          title="Sesion en curso"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer — user pill opens UserMenu popover with shortcuts to Settings tabs + Cerrar sesion */}
      <div className="border-t border-[var(--border-subtle)] p-3 relative">
        <button
          ref={profileButtonRef}
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors min-w-0 text-left"
          aria-label="Abrir menu de cuenta"
        >
          <span
            className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[10.5px] font-semibold text-white"
            style={{
              backgroundImage:
                'linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, black) 100%)',
            }}
            aria-hidden
          >
            {initials}
          </span>
          <span className="flex-1 min-w-0 flex flex-col leading-tight">
            <span className="text-[12.5px] font-medium text-[var(--text-strong)] truncate">
              {user?.display_name || user?.email || 'Usuario'}
            </span>
            <span className="text-[10.5px] text-[var(--text-faint)] truncate">
              {roleLabel}
            </span>
          </span>
        </button>
        <UserMenu
          open={userMenuOpen}
          onClose={() => setUserMenuOpen(false)}
          anchorRef={profileButtonRef}
        />
      </div>
    </aside>
  )
}
