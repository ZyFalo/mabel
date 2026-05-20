import { NavLink } from 'react-router-dom'
import { useAdminStore } from '../../stores/adminStore'

interface NavItem {
  to: string
  label: string
  end?: boolean
  badge?: 'reports' | 'safety'
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/safety-events', label: 'Safety Events', badge: 'safety' },
  { to: '/admin/reports', label: 'Reportes', badge: 'reports' },
  { to: '/admin/metrics', label: 'Metricas' },
  { to: '/admin/users', label: 'Usuarios' },
  { to: '/admin/config', label: 'Configuracion' },
  { to: '/admin/logs', label: 'Logs' },
]

export default function AdminSidebar() {
  const pendingReports = useAdminStore((s) => s.pendingReports)
  const activeSafetyEvents = useAdminStore((s) => s.activeSafetyEvents)

  function getBadgeCount(item: NavItem): number {
    if (item.badge === 'reports') return pendingReports
    if (item.badge === 'safety') return activeSafetyEvents
    return 0
  }

  return (
    <aside className="w-[220px] bg-accent shrink-0 flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <p className="text-white/40 text-[10px] font-semibold uppercase tracking-[0.18em]">
          Panel administrativo
        </p>
        <p className="text-white text-sm font-medium mt-1">Mabel IA</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const badgeCount = getBadgeCount(item)
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-white/15 text-white font-medium'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    ].join(' ')
                  }
                >
                  <span className="truncate">{item.label}</span>
                  {badgeCount > 0 && (
                    <span
                      className="shrink-0 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center bg-danger text-white text-[10px] font-semibold rounded-full"
                      aria-label={`${badgeCount} pendientes`}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-white/40 text-[10px] uppercase tracking-wider">v1.0 MVP</p>
      </div>
    </aside>
  )
}
