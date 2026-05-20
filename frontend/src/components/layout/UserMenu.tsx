import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HelpCircle,
  LogOut,
  Settings as SettingsIcon,
  Shield,
  User,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

interface UserMenuProps {
  open: boolean
  onClose: () => void
  /** Anchor used for outside-click detection; if the click is inside this ref OR the menu, it does not close. */
  anchorRef: React.RefObject<HTMLElement | null>
}

type MenuEntry =
  | {
      kind: 'item'
      id: string
      label: string
      icon: typeof SettingsIcon
      to?: string
      shortcut?: string
      disabled?: boolean
    }
  | { kind: 'divider'; id: string }

const ENTRIES: MenuEntry[] = [
  {
    kind: 'item',
    id: 'settings',
    label: 'Configuracion',
    icon: SettingsIcon,
    to: '/settings',
    shortcut: '⌘,',
  },
  {
    kind: 'item',
    id: 'profile',
    label: 'Perfil',
    icon: User,
    to: '/settings?tab=account',
  },
  {
    kind: 'item',
    id: 'privacy',
    label: 'Privacidad',
    icon: Shield,
    to: '/settings?tab=privacy',
  },
  {
    kind: 'item',
    id: 'help',
    label: 'Ayuda y soporte',
    icon: HelpCircle,
    disabled: true,
  },
  { kind: 'divider', id: 'sep' },
]

/**
 * Popover menu anchored above the sidebar profile button. Shows the 4 main
 * Mabel settings shortcuts (Configuracion, Perfil, Privacidad, Ayuda) plus
 * "Cerrar sesion" (mabel-700, red-tinted).
 *
 * Closes on: outside click, Escape, or item selection.
 */
export default function UserMenu({ open, onClose, anchorRef }: UserMenuProps) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Esc closes
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Outside click closes
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    // Use timeout so the same click that opened the menu does not immediately close it.
    const id = window.setTimeout(() => document.addEventListener('mousedown', onClick), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  function handleSelect(to?: string) {
    if (!to) {
      onClose()
      return
    }
    onClose()
    navigate(to)
  }

  function handleLogout() {
    onClose()
    logout()
    navigate('/login')
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu de usuario"
      className="absolute left-3 right-3 scale-in z-40"
      style={{
        bottom: 'calc(100% - 4px)',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--ink-200)',
        boxShadow: 'var(--shadow-lg)',
        padding: 6,
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Header card */}
      <div
        style={{
          padding: '8px 12px 10px',
          borderBottom: '1px solid var(--ink-100)',
          marginBottom: 4,
        }}
      >
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
          {user?.display_name || 'Usuario'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--ink-500)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {user?.email}
        </div>
      </div>

      {ENTRIES.map((entry) => {
        if (entry.kind === 'divider') {
          return (
            <div
              key={entry.id}
              style={{
                height: 1,
                background: 'var(--ink-100)',
                margin: '4px 8px',
              }}
            />
          )
        }
        const Icon = entry.icon
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            onClick={() => !entry.disabled && handleSelect(entry.to)}
            disabled={entry.disabled}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: entry.disabled ? 'not-allowed' : 'pointer',
              fontSize: 13,
              color: entry.disabled ? 'var(--ink-400)' : 'var(--ink-800)',
              fontFamily: 'var(--font-sans)',
              textAlign: 'left',
              fontWeight: 500,
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (!entry.disabled)
                e.currentTarget.style.background = 'var(--ink-100)'
            }}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'transparent')
            }
          >
            <Icon size={16} style={{ color: 'var(--ink-500)' }} />
            <span style={{ flex: 1 }}>{entry.label}</span>
            {entry.shortcut && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-400)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {entry.shortcut}
              </span>
            )}
          </button>
        )
      })}

      {/* Logout — red */}
      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--mabel-700)',
          fontFamily: 'var(--font-sans)',
          textAlign: 'left',
          fontWeight: 500,
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-50)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <LogOut size={16} />
        <span>Cerrar sesion</span>
      </button>
    </div>
  )
}
