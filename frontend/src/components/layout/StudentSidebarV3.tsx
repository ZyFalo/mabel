import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  MessageCircle,
  Plus,
  Search,
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
  /** Opens the shared CrisisOverlay hosted by StudentLayout. */
  onOpenCrisis?: () => void
  /** When true, sidebar renders as mobile drawer (always 268px, fixed position). */
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

function formatRelative(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}

function formatDuration(start: string, end: string | null) {
  if (!end) return 'en curso'
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const minutes = Math.max(1, Math.round((endMs - startMs) / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return '?'
  const parts = source.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

// ----- Inline primitives from prototype ----------------------------------

interface AvatarProps {
  initials: string
  size?: number
  bg?: string
  color?: string
}
function Avatar({ initials, size = 28, bg = 'var(--mabel-600)', color = '#fff' }: AvatarProps) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.42,
        flexShrink: 0,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '-0.01em',
      }}
    >
      {initials}
    </div>
  )
}

interface SidebarItemProps {
  icon: typeof Search
  label: string
  active?: boolean
  onClick?: () => void
}
function SidebarItem({ icon: Icon, label, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 10px',
        background: active ? 'var(--mabel-50)' : 'transparent',
        color: active ? 'var(--mabel-700)' : 'var(--ink-700)',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        fontFamily: 'var(--font-sans)',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--ink-100)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={17} />
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </button>
  )
}

interface SessionRowProps {
  session: SessionItem
  active: boolean
  onClick: () => void
}
function SessionRow({ session, active, onClick }: SessionRowProps) {
  const title = session.topic_hint || `Sesion ${formatRelative(session.started_at)}`
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'block',
        padding: '8px 10px',
        textAlign: 'left',
        background: active ? 'var(--mabel-50)' : 'transparent',
        color: active ? 'var(--mabel-700)' : 'var(--ink-700)',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--ink-100)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: active ? 'var(--mabel-700)' : 'var(--ink-400)',
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <Clock size={10} />
        <span style={{ whiteSpace: 'nowrap' }}>
          {formatRelative(session.started_at)} · {formatDuration(session.started_at, session.ended_at)}
        </span>
      </div>
    </button>
  )
}

// ----- Main component ---------------------------------------------------

export default function StudentSidebarV3({
  open,
  onToggle,
  onNewChat,
  onOpenSettings,
  onOpenCrisis,
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

  function handleOpenCrisis() {
    if (onOpenCrisis) onOpenCrisis()
  }

  // Collapsed rail (only on non-mobile flow). Mobile drawer always renders the
  // expanded variant — visibility is controlled by the parent via translate.
  if (!open && !mobileDrawer) {
    return (
      <aside
        className="h-full shrink-0 overflow-hidden border-r transition-[width] duration-300 ease-out relative"
        style={{
          width: 60,
          background: 'var(--ink-50)',
          borderColor: 'var(--ink-200)',
        }}
      >
        <CollapsedSidebar
          onExpand={onToggle}
          onNewChat={handleNewSession}
          onOpenSettings={handleSettings}
          onOpenCrisis={handleOpenCrisis}
          user={user}
        />
        {/* Floating toggle (also rendered on collapsed state) */}
        <button
          type="button"
          onClick={onToggle}
          title="Expandir"
          aria-label="Expandir sidebar"
          style={{
            position: 'absolute',
            top: 18,
            right: -12,
            zIndex: 6,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: '#fff',
            border: '1px solid var(--ink-200)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-500)',
            transition: 'color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mabel-600)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-500)')}
        >
          <ChevronRight size={14} strokeWidth={2.25} />
        </button>
      </aside>
    )
  }

  const groups = groupByDate(sessions as SessionItem[])
  const initials = getInitials(user?.display_name, user?.email)
  const displayName = user?.display_name || user?.email || 'Usuario'
  const email = user?.email || ''

  return (
    <aside
      style={{
        width: 268,
        height: '100%',
        flexShrink: 0,
        background: 'var(--ink-50)',
        borderRight: '1px solid var(--ink-200)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        // Stacking: must beat the chat header's backdrop-filter stacking context
        // so the floating collapse toggle (overflowing 12px to the right) stays
        // visible above the main content.
        zIndex: 30,
        transition: mobileDrawer ? undefined : 'width var(--dur-base) var(--ease-out)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Brand header */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar initials="M" size={28} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            lineHeight: 1.1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--ink-900)',
              letterSpacing: '-0.01em',
            }}
          >
            Mabel
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-400)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            UMB · Bienestar
          </span>
        </div>
      </div>

      {/* Nueva sesion - primary CTA */}
      <div style={{ padding: '0 12px' }}>
        <button
          type="button"
          onClick={handleNewSession}
          title="Nueva sesion"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'var(--mabel-600)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            letterSpacing: '-0.005em',
            boxShadow: 'var(--shadow-sm)',
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
        >
          <Plus size={16} strokeWidth={2.25} />
          Nueva sesion
        </button>
      </div>

      {/* Nav items */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <SidebarItem icon={Search} label="Buscar sesiones" onClick={() => {}} />
        <SidebarItem icon={MessageCircle} label="Conversaciones" active onClick={() => {}} />
      </div>

      {/* Sessions list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {!historyEnabled ? (
          <div
            style={{
              padding: '18px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'flex-start',
            }}
          >
            <p
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--ink-900)',
                lineHeight: 1.3,
              }}
            >
              Historial desactivado
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--ink-400)', lineHeight: 1.4 }}>
              Tus conversaciones no se guardan.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--mabel-700)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                marginTop: 2,
                cursor: 'pointer',
              }}
            >
              Activar en preferencias
            </button>
          </div>
        ) : isLoadingSessions && sessions.length === 0 ? (
          <div style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonText />
            <SkeletonText />
          </div>
        ) : groups.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-400)',
              padding: '12px 10px',
            }}
          >
            Aun no tienes conversaciones.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: 'var(--ink-400)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '10px 10px 6px',
                }}
              >
                {group.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {group.items.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    active={params.id === s.id}
                    onClick={() => handleSessionClick(s)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky SOS — always above profile */}
      <div style={{ padding: '0 12px 8px' }}>
        <button
          type="button"
          onClick={handleOpenCrisis}
          title="Linea de crisis SOS"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: 'var(--mabel-50)',
            color: 'var(--mabel-700)',
            border: '1px solid var(--mabel-100)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            cursor: 'pointer',
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-50)')}
        >
          <AlertTriangle size={16} />
          Linea de crisis SOS
        </button>
      </div>

      {/* Profile pill footer */}
      <div
        style={{
          padding: '10px 12px 12px',
          borderTop: '1px solid var(--ink-200)',
          position: 'relative',
        }}
      >
        <button
          ref={profileButtonRef}
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          aria-label="Abrir menu de cuenta"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: userMenuOpen ? 'var(--ink-100)' : 'transparent',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            if (!userMenuOpen) e.currentTarget.style.background = 'var(--ink-100)'
          }}
          onMouseLeave={(e) => {
            if (!userMenuOpen) e.currentTarget.style.background = 'transparent'
          }}
        >
          <Avatar initials={initials} size={32} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--ink-900)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink-400)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {email}
            </div>
          </div>
          <ChevronUp size={14} style={{ color: 'var(--ink-400)' }} />
        </button>
        <UserMenu
          open={userMenuOpen}
          onClose={() => setUserMenuOpen(false)}
          anchorRef={profileButtonRef}
        />
      </div>

      {/* Floating collapse toggle */}
      {!mobileDrawer && (
        <button
          type="button"
          onClick={onToggle}
          title="Colapsar"
          aria-label="Colapsar sidebar"
          style={{
            position: 'absolute',
            top: 18,
            right: -12,
            zIndex: 6,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: '#fff',
            border: '1px solid var(--ink-200)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-500)',
            transition: 'color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mabel-600)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-500)')}
        >
          <ChevronLeft size={14} strokeWidth={2.25} />
        </button>
      )}
    </aside>
  )
}
