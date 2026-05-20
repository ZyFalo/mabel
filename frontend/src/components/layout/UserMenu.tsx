import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock,
  Eye,
  Volume2,
  User,
  Database,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

interface UserMenuProps {
  open: boolean
  onClose: () => void
  /** Anchor used for outside-click detection; if the click is inside this ref OR the menu, it does not close. */
  anchorRef: React.RefObject<HTMLElement | null>
}

interface MenuItem {
  id: string
  label: string
  icon: typeof Lock
  to: string
  shortcut?: string
  destructive?: boolean
}

const SETTINGS_ITEMS: MenuItem[] = [
  { id: 'settings', label: 'Configuracion', icon: SettingsIcon, to: '/settings', shortcut: '⌘,' },
  { id: 'privacy', label: 'Privacidad', icon: Lock, to: '/settings?tab=privacy' },
  { id: 'accessibility', label: 'Accesibilidad', icon: Eye, to: '/settings?tab=accessibility' },
  { id: 'voice', label: 'Voz', icon: Volume2, to: '/settings?tab=voice' },
  { id: 'account', label: 'Cuenta', icon: User, to: '/settings?tab=account' },
  { id: 'arco', label: 'Mis datos (ARCO)', icon: Database, to: '/settings?tab=arco' },
]

/**
 * Popover menu anchored above the sidebar profile button. Lists shortcuts
 * to each Settings tab (via ?tab= query param) and Cerrar sesion.
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

  function handleSelect(to: string) {
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
      className="absolute bottom-full left-3 right-3 mb-2 rounded-xl shadow-lg overflow-hidden scale-in z-40"
      style={{
        backgroundColor: '#fff',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--ink-200)',
      }}
    >
      {/* Header: name + email */}
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: 'var(--ink-100)' }}
      >
        <div
          className="text-[13px] font-medium truncate"
          style={{ color: 'var(--ink-900)' }}
        >
          {user?.display_name || 'Usuario'}
        </div>
        <div
          className="text-[11.5px] truncate mt-0.5"
          style={{ color: 'var(--ink-400)' }}
        >
          {user?.email}
        </div>
      </div>

      {/* Settings shortcuts */}
      <div className="py-1">
        {SETTINGS_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => handleSelect(item.to)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--ink-100)]"
              style={{ color: 'var(--ink-700)' }}
            >
              <Icon size={14} style={{ color: 'var(--ink-500)' }} />
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span
                  className="text-[11px] tabular-nums"
                  style={{ color: 'var(--ink-400)' }}
                >
                  {item.shortcut}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Logout */}
      <div
        className="border-t py-1"
        style={{ borderColor: 'var(--ink-100)' }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--ink-100)]"
          style={{ color: 'var(--danger-600)' }}
        >
          <LogOut size={14} />
          <span>Cerrar sesion</span>
        </button>
      </div>
    </div>
  )
}
