import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  EyeOff,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useAuthStore } from '../../stores/authStore'
import { usePreferencesStore } from '../../stores/preferencesStore'
import { useToastStore } from '../../stores/toastStore'
import { SkeletonText } from '../ui/Skeleton'
import UmbAvatar from '../ui/UmbAvatar'
import UserMenu from './UserMenu'
import SessionSearchModal from '../chat/SessionSearchModal'
import ConfirmDeleteSessionModal from '../chat/ConfirmDeleteSessionModal'
import apiClient from '../../api/client'
import type { TabId as SettingsTabId } from '../../pages/Settings'

interface StudentSidebarV3Props {
  open: boolean
  onToggle: () => void
  onNewChat?: () => void
  /**
   * Open the Settings modal. Accepts an optional `tab` so UserMenu shortcuts
   * (Perfil → 'account', Privacidad → 'privacy') can deeplink.
   */
  onOpenSettings?: (tab?: SettingsTabId) => void
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

const SIDEBAR_EXPANDED = 268
const SIDEBAR_COLLAPSED = 60
const COLLAPSE_DURATION = 280 // ms — keep in sync across container + labels

/**
 * Group sessions into temporal buckets (most-recent first).
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

// ----- Inline primitives --------------------------------------------------

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

/**
 * Inline-grid label wrapper that animates its width between 0 and auto via
 * `grid-template-columns`. Keeps surrounding icons stable while collapsing.
 */
interface LabelProps {
  open: boolean
  children: React.ReactNode
  /** Optional fixed delay for staggered fades. */
  delay?: number
}
function Label({ open, children, delay = 0 }: LabelProps) {
  return (
    <span
      aria-hidden={!open}
      style={{
        display: 'grid',
        gridTemplateColumns: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        // When closed: flex 0 0 0 so the label takes no horizontal space,
        // letting `justify-content: center` on the parent actually center
        // the icon. When open: flex 1 1 auto so the label fills the row.
        flex: open ? '1 1 auto' : '0 0 0',
        transition: `grid-template-columns ${COLLAPSE_DURATION}ms var(--ease-out) ${delay}ms, opacity ${COLLAPSE_DURATION * 0.7}ms var(--ease-out) ${delay}ms, flex-basis ${COLLAPSE_DURATION}ms var(--ease-out) ${delay}ms`,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </span>
    </span>
  )
}

interface SidebarItemProps {
  icon: typeof Search
  label: string
  open: boolean
  active?: boolean
  onClick?: () => void
}
function SidebarItem({ icon: Icon, label, open, active, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? undefined : label}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: open ? 10 : 0,
        padding: open ? '9px 10px' : '9px 0',
        justifyContent: open ? 'flex-start' : 'center',
        background: active ? 'var(--mabel-50)' : 'transparent',
        color: active ? 'var(--mabel-700)' : 'var(--ink-700)',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 13.5,
        fontWeight: active ? 600 : 500,
        fontFamily: 'var(--font-sans)',
        transition: `background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), padding ${COLLAPSE_DURATION}ms var(--ease-out), gap ${COLLAPSE_DURATION}ms var(--ease-out)`,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--ink-100)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={17} style={{ flexShrink: 0 }} />
      <Label open={open}>{label}</Label>
    </button>
  )
}

interface SessionRowProps {
  session: SessionItem
  active: boolean
  onClick: () => void
  onHide: (s: SessionItem) => void
  onRequestDelete: (s: SessionItem) => void
}
function SessionRow({ session, active, onClick, onHide, onRequestDelete }: SessionRowProps) {
  const title = session.topic_hint || `Sesion ${formatRelative(session.started_at)}`
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Cerrar menú al click fuera o Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Mostrar el botón 3-puntos cuando hover sobre la fila o cuando el
  // menú está abierto (para que no desaparezca al mover el mouse hacia
  // las opciones).
  const showMenuButton = hovered || menuOpen

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          display: 'block',
          padding: '8px 10px',
          paddingRight: 36, // espacio reservado para el botón 3-puntos
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

      {/* Botón 3-puntos: visible al hover o cuando el menú está abierto.
          Click abre el menú sin propagar al botón padre (que navegaría
          a la sesión). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen((v) => !v)
        }}
        aria-label="Opciones de esta conversación"
        aria-expanded={menuOpen}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 24,
          height: 24,
          borderRadius: 6,
          background: menuOpen ? 'var(--ink-200)' : 'transparent',
          border: 'none',
          color: 'var(--ink-500)',
          cursor: 'pointer',
          display: showMenuButton ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          if (!menuOpen) e.currentTarget.style.background = 'var(--ink-200)'
        }}
        onMouseLeave={(e) => {
          if (!menuOpen) e.currentTarget.style.background = 'transparent'
        }}
      >
        <MoreVertical size={14} />
      </button>

      {/* Menú flotante con las dos opciones aprobadas por el agente
          ético (2026-05-23): copy literal honesto vs eufemismos. */}
      {menuOpen && (
        <div
          role="menu"
          className="scale-in"
          style={{
            position: 'absolute',
            top: 32,
            right: 6,
            zIndex: 50,
            minWidth: 220,
            background: '#fff',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lg, 0 10px 30px -8px rgba(0,0,0,0.15))',
            padding: '4px 0',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onHide(session)
            }}
            style={menuItemStyle()}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-50)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <EyeOff size={14} />
            Quitar de mi barra lateral
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onRequestDelete(session)
            }}
            style={menuItemStyle(true)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--danger-50, #FEF2F2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={14} />
            Eliminar definitivamente
          </button>
        </div>
      )}
    </div>
  )
}

function menuItemStyle(danger = false): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 14px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: danger ? 'var(--danger-700, #B91C1C)' : 'var(--ink-700)',
    fontWeight: 500,
    textAlign: 'left',
    transition: 'background var(--dur-fast) var(--ease-out)',
    fontFamily: 'var(--font-sans)',
  }
}

// ----- Main component ----------------------------------------------------

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
  const [searchOpen, setSearchOpen] = useState(false)
  const profileButtonRef = useRef<HTMLButtonElement | null>(null)
  const { sessions, loadSessions, isLoadingSessions, saveHistoryEnabled } =
    useChatStore()
  const preferences = usePreferencesStore((s) => s.preferences)
  const addToast = useToastStore((s) => s.addToast)

  // Estado del flujo "eliminar sesión" — el modal de confirmación se
  // dispara desde el menú 3-puntos. Mantenemos `pendingDelete` para
  // saber qué sesión confirmar y `submittingDelete` para deshabilitar
  // el botón mientras el DELETE está en vuelo.
  const [pendingDelete, setPendingDelete] = useState<SessionItem | null>(null)
  const [submittingDelete, setSubmittingDelete] = useState(false)

  async function handleHideSession(s: SessionItem) {
    // Soft hide: la sesión deja de aparecer en el sidebar pero queda
    // en BD. Re-fetch para reflejar la lista nueva (con índice parcial
    // del backend, no debería traerla más).
    try {
      await apiClient.patch(`/sessions/${s.id}/hide`)
      addToast({
        type: 'success',
        message: 'Conversación quitada de tu barra lateral',
      })
      // Si estabas viendo esta sesión, navegar al Home (ya no la verás
      // en el listado, mejor sacar al usuario del estado huérfano).
      if (params.id === s.id) navigate('/home')
      await loadSessions()
    } catch {
      addToast({
        type: 'error',
        message: 'No pudimos ocultar la conversación. Intenta de nuevo.',
      })
    }
  }

  function handleRequestDelete(s: SessionItem) {
    setPendingDelete(s)
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setSubmittingDelete(true)
    try {
      await apiClient.delete(`/sessions/${pendingDelete.id}`)
      addToast({
        type: 'success',
        message: 'Conversación eliminada definitivamente',
      })
      if (params.id === pendingDelete.id) navigate('/home')
      await loadSessions()
      setPendingDelete(null)
    } catch {
      addToast({
        type: 'error',
        message: 'No pudimos eliminar la conversación. Intenta de nuevo.',
      })
    } finally {
      setSubmittingDelete(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const historyEnabled =
    preferences && typeof preferences.save_history === 'boolean'
      ? preferences.save_history
      : saveHistoryEnabled

  function handleNewSession() {
    // Lazy session creation (2026-05-23): el sidebar "Nueva sesión"
    // ya NO crea sesión en BD. Navega al Home para que el estudiante
    // decida cómo arrancar (mensaje directo o check-in primero). La
    // sesión nace solo cuando hay acción real: submit del check-in o
    // primer mensaje. Esto evita el patrón previo donde cada click
    // en "Nueva sesión" creaba una sesión que muchas veces quedaba
    // sin uso, ensuciando el sidebar y las métricas.
    if (onNewChat) {
      onNewChat()
      return
    }
    navigate('/home')
  }

  function handleSessionClick(s: SessionItem) {
    if (s.ended_at) {
      navigate(`/session/${s.id}/detail`)
    } else {
      navigate(`/session/${s.id}/chat`)
    }
  }

  function handleSettings() {
    // Settings is no longer a route — it's a modal opened via the prop.
    onOpenSettings?.()
  }

  function handleOpenCrisis() {
    if (onOpenCrisis) onOpenCrisis()
  }

  // Mobile drawer always renders the expanded variant.
  const isOpen = open || mobileDrawer
  const groups = groupByDate(sessions as SessionItem[])
  const initials = getInitials(user?.display_name, user?.email)
  const displayName = user?.display_name || user?.email || 'Usuario'
  const email = user?.email || ''

  return (
    <>
    <SessionSearchModal
      open={searchOpen}
      onClose={() => setSearchOpen(false)}
      sessions={sessions as SessionItem[]}
    />
    <aside
      style={{
        width: isOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
        height: '100%',
        flexShrink: 0,
        background: 'var(--ink-50)',
        borderRight: '1px solid var(--ink-200)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 30,
        transition: mobileDrawer ? undefined : `width ${COLLAPSE_DURATION}ms var(--ease-out)`,
        fontFamily: 'var(--font-sans)',
        // NOTE: NO overflow:hidden here. The floating collapse toggle
        // overflows 12px to the right (right: -12px) and must remain
        // visible. Internal overflow is handled per-section (sessions
        // list has overflow-y auto + overflow-x hidden; labels clip via
        // their own grid-template-columns trick).
      }}
    >
      {/* Brand header — Avatar M anchored left, label fades */}
      <div
        style={{
          padding: isOpen ? '14px 16px' : '14px 0',
          display: 'flex',
          alignItems: 'center',
          gap: isOpen ? 10 : 0,
          justifyContent: isOpen ? 'flex-start' : 'center',
          transition: `padding ${COLLAPSE_DURATION}ms var(--ease-out), gap ${COLLAPSE_DURATION}ms var(--ease-out)`,
        }}
      >
        <UmbAvatar size={32} />
        <Label open={isOpen}>
          <span
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
          </span>
        </Label>
      </div>

      {/* Nueva sesion — primary CTA */}
      <div
        style={{
          padding: isOpen ? '0 12px' : '0 10px',
          transition: `padding ${COLLAPSE_DURATION}ms var(--ease-out)`,
        }}
      >
        <button
          type="button"
          onClick={handleNewSession}
          title={isOpen ? undefined : 'Nueva sesion'}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isOpen ? 8 : 0,
            padding: isOpen ? '10px 14px' : '10px 0',
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
            transition: `background var(--dur-fast) var(--ease-out), padding ${COLLAPSE_DURATION}ms var(--ease-out), gap ${COLLAPSE_DURATION}ms var(--ease-out)`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
        >
          <Plus size={16} strokeWidth={2.25} style={{ flexShrink: 0 }} />
          <Label open={isOpen}>Nueva sesion</Label>
        </button>
      </div>

      {/* Nav items */}
      <div
        style={{
          padding: isOpen ? '8px 12px' : '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          transition: `padding ${COLLAPSE_DURATION}ms var(--ease-out)`,
        }}
      >
        <SidebarItem
          icon={Search}
          label="Buscar sesiones"
          open={isOpen}
          onClick={() => setSearchOpen(true)}
        />
        <SidebarItem
          icon={MessageCircle}
          label="Conversaciones"
          open={isOpen}
          active
          onClick={() => navigate('/home')}
        />
      </div>

      {/* Sessions list — fades and collapses height when sidebar is closed */}
      <div
        style={{
          flex: 1,
          overflowY: isOpen ? 'auto' : 'hidden',
          overflowX: 'hidden',
          padding: isOpen ? '0 12px 8px' : '0',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: `opacity ${COLLAPSE_DURATION * 0.6}ms var(--ease-out), padding ${COLLAPSE_DURATION}ms var(--ease-out)`,
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
              onClick={handleSettings}
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
                    onHide={handleHideSession}
                    onRequestDelete={handleRequestDelete}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* SOS access lives in each page's top bar (SosButton component) —
          no longer duplicated in the sidebar. */}

      {/* Profile pill footer */}
      <div
        style={{
          padding: isOpen ? '10px 12px 12px' : '10px 10px 12px',
          borderTop: '1px solid var(--ink-200)',
          position: 'relative',
          transition: `padding ${COLLAPSE_DURATION}ms var(--ease-out)`,
        }}
      >
        <button
          ref={profileButtonRef}
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          aria-label="Abrir menu de cuenta"
          title={isOpen ? undefined : displayName}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isOpen ? 'flex-start' : 'center',
            gap: isOpen ? 10 : 0,
            padding: isOpen ? '8px 10px' : '8px 0',
            background: userMenuOpen ? 'var(--ink-100)' : 'transparent',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
            transition: `background var(--dur-fast) var(--ease-out), padding ${COLLAPSE_DURATION}ms var(--ease-out), gap ${COLLAPSE_DURATION}ms var(--ease-out)`,
          }}
          onMouseEnter={(e) => {
            if (!userMenuOpen) e.currentTarget.style.background = 'var(--ink-100)'
          }}
          onMouseLeave={(e) => {
            if (!userMenuOpen) e.currentTarget.style.background = 'transparent'
          }}
        >
          <Avatar initials={initials} size={32} />
          <Label open={isOpen}>
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.2, display: 'block' }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--ink-900)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {displayName}
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--ink-400)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {email}
              </span>
            </span>
          </Label>
          {isOpen && <ChevronUp size={14} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />}
        </button>
        <UserMenu
          open={userMenuOpen}
          onClose={() => setUserMenuOpen(false)}
          anchorRef={profileButtonRef}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {/* Floating collapse toggle */}
      {!mobileDrawer && (
        <button
          type="button"
          onClick={onToggle}
          title={isOpen ? 'Colapsar' : 'Expandir'}
          aria-label={isOpen ? 'Colapsar sidebar' : 'Expandir sidebar'}
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
          {isOpen ? (
            <ChevronLeft size={14} strokeWidth={2.25} />
          ) : (
            <ChevronRight size={14} strokeWidth={2.25} />
          )}
        </button>
      )}
    </aside>
    {/* Modal de confirmación hard-delete. Vive a nivel del Fragment
        para que no se vea afectado por el overflow/transform del
        aside (sin esto, el modal puede recortarse). */}
    <ConfirmDeleteSessionModal
      open={pendingDelete !== null}
      sessionTitle={
        pendingDelete?.topic_hint ||
        (pendingDelete ? `Sesión ${formatRelative(pendingDelete.started_at)}` : '')
      }
      onCancel={() => setPendingDelete(null)}
      onConfirm={handleConfirmDelete}
      submitting={submittingDelete}
    />
    </>
  )
}
