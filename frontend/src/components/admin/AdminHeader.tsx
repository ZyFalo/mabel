import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useAdminStore } from '../../stores/adminStore'

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

interface Crumb {
  label: string
  /** When set, the crumb renders as a link to this path. The last crumb
   * (current view) leaves `to` undefined so it renders as plain text. */
  to?: string
}

/**
 * Build the breadcrumb trail for the current admin route.
 *
 * Designed to read naturally: "Panel administrativo › Usuarios › Detalle
 * del usuario". The first crumb (Panel administrativo) is rendered by the
 * header outside this function; we return only the trail from the section
 * onwards. Intermediate crumbs are clickable to the parent list view; the
 * last one is plain text representing the current page.
 */
function getBreadcrumb(pathname: string): Crumb[] {
  // Exact root pages
  if (SECTION_LABELS[pathname]) {
    return [{ label: SECTION_LABELS[pathname] }]
  }

  // Detail / nested routes per section
  if (pathname.startsWith('/admin/users/')) {
    return [
      { label: 'Usuarios', to: '/admin/users' },
      { label: 'Detalle del usuario' },
    ]
  }
  if (pathname.startsWith('/admin/safety-events/')) {
    return [
      { label: 'Safety events', to: '/admin/safety-events' },
      { label: 'Detalle del evento' },
    ]
  }
  if (pathname.startsWith('/admin/reports/')) {
    return [
      { label: 'Reportes', to: '/admin/reports' },
      { label: 'Detalle del reporte' },
    ]
  }

  // Section-prefix fallbacks (e.g. /admin/metrics?tab=usage stays as
  // "Métricas"; tab is a query param, not a path segment).
  if (pathname.startsWith('/admin/safety-events')) return [{ label: 'Safety events' }]
  if (pathname.startsWith('/admin/reports')) return [{ label: 'Reportes' }]
  if (pathname.startsWith('/admin/metrics')) return [{ label: 'Métricas' }]
  if (pathname.startsWith('/admin/empathy-ratings')) {
    return [{ label: 'Calificación de empatía' }]
  }
  if (pathname.startsWith('/admin/config')) return [{ label: 'Configuración' }]
  if (pathname.startsWith('/admin/logs')) return [{ label: 'Logs' }]

  return [{ label: 'Dashboard' }]
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
  const toggleMobileNav = useAdminStore((s) => s.toggleMobileNav)
  const { user, logout } = useAuthStore()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (!user) return null

  const trail = getBreadcrumb(location.pathname)
  const initials = getInitials(user.display_name, user.email)
  const displayName = user.display_name || (user.email ? user.email.split('@')[0] : 'Admin')

  return (
    <header
      className="shrink-0 flex items-center justify-between"
      style={{
        // Notch/Dynamic Island (iPhone 13 Pro+): el AdminHeader es el
        // primer elemento del AdminLayout (h-screen), sin safe-area
        // queda pegado bajo el notch en mobile. Reemplazamos `height`
        // fijo por `minHeight` dinámico para que el header crezca y
        // mantenga sus 64px internos. Patrón unificado de los 3
        // headers (CR-A10 review 2026-05-26).
        minHeight: 'calc(64px + var(--safe-top))',
        paddingTop: 'var(--safe-top)',
        background: 'var(--white)',
        borderBottom: '1px solid var(--ink-200)',
        paddingLeft: 'max(24px, var(--safe-left))',
        paddingRight: 'max(24px, var(--safe-right))',
      }}
    >
      {/* Mobile hamburger — solo visible <768px via CSS. Toggle del
          drawer del sidebar admin. Desktop usa sidebar fijo y no
          renderea este boton (display: none). */}
      <button
        type="button"
        onClick={toggleMobileNav}
        className="admin-mobile-hamburger"
        aria-label="Abrir menu lateral"
        style={{
          display: 'none', // CSS @media lo muestra en mobile
          background: 'transparent',
          border: 'none',
          color: 'var(--ink-700)',
          cursor: 'pointer',
          padding: '8px',
          marginRight: 4,
          borderRadius: 8,
        }}
      >
        <Menu size={20} />
      </button>

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
        {trail.map((crumb, idx) => {
          const isLast = idx === trail.length - 1
          return (
            <span key={`${crumb.label}-${idx}`} className="flex items-center">
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
              {isLast || !crumb.to ? (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  style={{
                    fontSize: 14,
                    color: 'var(--ink-900)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                  }}
                  className="truncate"
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(crumb.to!)}
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
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-500)'
                  }}
                >
                  {crumb.label}
                </button>
              )}
            </span>
          )
        })}
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
