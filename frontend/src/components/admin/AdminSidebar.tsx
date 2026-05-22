import { useNavigate, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ShieldAlert,
  Flag,
  BarChart3,
  Heart,
  Users,
  Settings,
  ScrollText,
  LogOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAdminStore } from '../../stores/adminStore'
import { useAuthStore } from '../../stores/authStore'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: 'reports' | 'safety'
}

interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'op',
    label: 'Operación',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/safety-events', label: 'Safety events', icon: ShieldAlert, badge: 'safety' },
      { to: '/admin/reports', label: 'Reportes', icon: Flag, badge: 'reports' },
    ],
  },
  {
    id: 'data',
    label: 'Datos',
    items: [
      { to: '/admin/metrics', label: 'Métricas', icon: BarChart3 },
      { to: '/admin/empathy-ratings', label: 'Calificación empatía', icon: Heart },
      { to: '/admin/users', label: 'Usuarios', icon: Users },
    ],
  },
  {
    id: 'sys',
    label: 'Sistema',
    items: [
      { to: '/admin/config', label: 'Configuración', icon: Settings },
      { to: '/admin/logs', label: 'Logs', icon: ScrollText },
    ],
  },
]

function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return email ?? ''
  const [local, domain] = email.split('@')
  if (!local) return email
  return `${local.charAt(0).toLowerCase()}***@${domain}`
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return 'A'
  const parts = source.trim().split(/[\s.]+/).slice(0, 2)
  return (parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'A').slice(0, 2)
}

export default function AdminSidebar() {
  const navigate = useNavigate()
  const pendingReports = useAdminStore((s) => s.pendingReports)
  const activeSafetyEvents = useAdminStore((s) => s.activeSafetyEvents)
  const { user, logout } = useAuthStore()

  function getBadgeCount(item: NavItem): number {
    if (item.badge === 'reports') return pendingReports
    if (item.badge === 'safety') return activeSafetyEvents
    return 0
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const initials = getInitials(user?.display_name, user?.email)

  return (
    <aside
      className="shrink-0 flex flex-col h-full"
      style={{
        width: 220,
        background: 'var(--ink-900)',
        color: 'var(--ink-200)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Top brand block */}
      <div
        style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid var(--ink-800)',
        }}
      >
        <p
          style={{
            color: 'var(--ink-400)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            margin: 0,
          }}
        >
          Panel administrativo
        </p>
        <p
          style={{
            color: 'var(--white)',
            fontSize: 15,
            fontWeight: 700,
            marginTop: 4,
            marginBottom: 0,
            letterSpacing: '-0.01em',
          }}
        >
          Mabel IA
        </p>
      </div>

      {/* Nav groups */}
      <nav
        className="flex-1 overflow-y-auto"
        style={{ padding: '12px 10px' }}
        aria-label="Navegación administrativa"
      >
        {NAV_GROUPS.map((group, gIdx) => (
          <div key={group.id} style={{ marginTop: gIdx === 0 ? 0 : 16 }}>
            <p
              style={{
                color: 'var(--ink-400)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                padding: '6px 10px 8px',
                margin: 0,
              }}
            >
              {group.label}
            </p>
            <ul className="flex flex-col" style={{ gap: 2 }}>
              {group.items.map((item) => {
                const Icon = item.icon
                const badgeCount = getBadgeCount(item)
                return (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.end} style={{ textDecoration: 'none' }}>
                      {({ isActive }) => (
                        <span
                          className="flex items-center"
                          style={{
                            position: 'relative',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            fontSize: 13.5,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--white)' : 'var(--ink-300)',
                            background: isActive ? 'var(--mabel-600)' : 'transparent',
                            borderLeft: isActive
                              ? '3px solid var(--mabel-300)'
                              : '3px solid transparent',
                            paddingLeft: isActive ? 7 : 10,
                            transition:
                              'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'var(--ink-800)'
                              e.currentTarget.style.color = 'var(--white)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--ink-300)'
                            }
                          }}
                        >
                          <Icon size={16} style={{ flexShrink: 0 }} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {badgeCount > 0 && (
                            <span
                              aria-label={`${badgeCount} pendientes`}
                              style={{
                                background:
                                  item.badge === 'safety'
                                    ? 'var(--danger-600)'
                                    : 'var(--warn-600)',
                                color: 'var(--white)',
                                fontSize: 10,
                                fontWeight: 700,
                                minWidth: 20,
                                height: 18,
                                padding: '0 6px',
                                borderRadius: 9999,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                tabSize: 'tabular-nums',
                              }}
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Profile pill */}
      <div
        style={{
          padding: 12,
          borderTop: '1px solid var(--ink-800)',
        }}
      >
        <div
          style={{
            background: 'var(--ink-800)',
            borderRadius: 12,
            padding: '10px 10px 8px',
          }}
        >
          <div className="flex items-center" style={{ gap: 9 }}>
            <span
              aria-hidden
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'var(--mabel-600)',
                color: 'var(--white)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="truncate"
                style={{
                  fontSize: 11.5,
                  color: 'var(--ink-100)',
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: 1.25,
                }}
                title={maskEmail(user?.email)}
              >
                {maskEmail(user?.email)}
              </p>
              <p
                style={{
                  fontSize: 10,
                  color: 'var(--ink-400)',
                  margin: 0,
                  marginTop: 2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontWeight: 600,
                }}
              >
                Admin · v1.0 MVP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center w-full"
            style={{
              marginTop: 8,
              gap: 6,
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--ink-300)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition:
                'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ink-900)'
              e.currentTarget.style.color = 'var(--white)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--ink-300)'
            }}
            aria-label="Cerrar sesión"
          >
            <LogOut size={12} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
