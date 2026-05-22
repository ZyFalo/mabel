import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

const SECTION_LABELS: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/safety-events': 'Safety events',
  '/admin/reports': 'Reportes',
  '/admin/metrics': 'Métricas',
  '/admin/empathy-ratings': 'Calificación de empatía',
  '/admin/users': 'Usuarios',
  '/admin/config': 'Configuración',
  '/admin/logs': 'Logs',
}

function getSectionLabel(pathname: string): string {
  // Exact matches first
  if (SECTION_LABELS[pathname]) return SECTION_LABELS[pathname]
  // Prefix matches (e.g. /admin/users/:id → Usuarios)
  if (pathname.startsWith('/admin/users/')) return 'Usuarios'
  if (pathname.startsWith('/admin/safety-events')) return 'Safety events'
  if (pathname.startsWith('/admin/reports')) return 'Reportes'
  if (pathname.startsWith('/admin/metrics')) return 'Métricas'
  if (pathname.startsWith('/admin/empathy-ratings')) return 'Calificación de empatía'
  if (pathname.startsWith('/admin/config')) return 'Configuración'
  if (pathname.startsWith('/admin/logs')) return 'Logs'
  return 'Dashboard'
}

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return 'A'
  const parts = source.trim().split(/[\s.]+/).slice(0, 2)
  return (parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'A').slice(0, 2)
}

export default function AdminHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (!user) return null

  const section = getSectionLabel(location.pathname)
  const initials = getInitials(user.display_name, user.email)
  const displayName = user.display_name || (user.email ? user.email.split('@')[0] : 'Admin')

  return (
    <header
      className="shrink-0 flex items-center justify-between"
      style={{
        height: 64,
        background: 'var(--white)',
        borderBottom: '1px solid var(--ink-200)',
        padding: '0 24px',
      }}
    >
      {/* Left: breadcrumb */}
      <nav
        aria-label="Ubicación"
        className="flex items-center min-w-0"
        style={{ gap: 6 }}
      >
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="truncate"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--ink-500)',
            fontWeight: 500,
            letterSpacing: '0.01em',
            padding: '4px 0',
          }}
        >
          Panel administrativo
        </button>
        <span
          aria-hidden
          style={{
            color: 'var(--ink-400)',
            fontSize: 14,
            lineHeight: 1,
            margin: '0 4px',
          }}
        >
          ›
        </span>
        <span
          style={{
            fontSize: 14,
            color: 'var(--ink-900)',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
          }}
          className="truncate"
        >
          {section}
        </span>
      </nav>

      {/* Right: user pill */}
      <div
        className="flex items-center"
        style={{
          gap: 8,
          padding: '6px 8px 6px 6px',
          background: 'var(--white)',
          border: '1px solid var(--ink-200)',
          borderRadius: 9999,
          transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--mabel-100)',
            color: 'var(--mabel-700)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {initials}
        </span>
        <div
          className="hidden sm:flex flex-col leading-none"
          style={{ fontSize: 12 }}
        >
          <span style={{ color: 'var(--ink-900)', fontWeight: 600 }}>
            {displayName}
          </span>
          <span
            style={{
              color: 'var(--mabel-700)',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginTop: 2,
            }}
          >
            Admin
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 9999,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-600)',
            transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ink-100)'
            e.currentTarget.style.color = 'var(--mabel-700)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--ink-600)'
          }}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  )
}
