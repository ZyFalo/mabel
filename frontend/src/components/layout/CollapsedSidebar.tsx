import {
  AlertTriangle,
  MessageSquare,
  Plus,
  Search,
  Settings,
} from 'lucide-react'

interface CollapsedSidebarProps {
  onExpand: () => void
  onNewChat: () => void
  onOpenSettings: () => void
  onOpenCrisis: () => void
  user: { display_name?: string | null; email?: string | null } | null
}

/**
 * Compute initials from a display name.
 * "Andrea Estudiante" -> "AE", "Andrea" -> "A", null -> "?"
 */
function getInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return '?'
  const parts = source.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?'
}

interface RailButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}

function RailButton({ icon, label, onClick, tone = 'default' }: RailButtonProps) {
  const baseColor = tone === 'danger' ? 'var(--mabel-700)' : 'var(--ink-500)'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative group/btn flex items-center justify-center transition-colors"
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        background: 'transparent',
        border: 'none',
        color: baseColor,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      <span
        className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md whitespace-nowrap text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 shadow-md z-50"
        role="tooltip"
        style={{ background: 'var(--ink-900)', color: 'var(--ink-50)' }}
      >
        {label}
      </span>
    </button>
  )
}

export default function CollapsedSidebar({
  onExpand,
  onNewChat,
  onOpenSettings,
  onOpenCrisis,
  user,
}: CollapsedSidebarProps) {
  const initials = getInitials(user?.display_name, user?.email)

  return (
    <div
      className="h-full flex flex-col items-center py-3"
      style={{ width: 60, background: 'var(--ink-50)' }}
    >
      {/* Brand mark (acts as expand trigger too) */}
      <button
        type="button"
        onClick={onExpand}
        title="Expandir sidebar"
        aria-label="Expandir sidebar"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--mabel-600)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 12,
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '-0.01em',
        }}
      >
        M
      </button>

      {/* Prominent Nueva sesion (mirror of expanded CTA) */}
      <div style={{ height: 14 }} />
      <button
        type="button"
        onClick={onNewChat}
        title="Nueva sesion"
        aria-label="Nueva sesion"
        className="relative group/btn"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--mabel-600)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
      >
        <Plus size={16} strokeWidth={2.25} />
        <span
          className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md whitespace-nowrap text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 shadow-md z-50"
          role="tooltip"
          style={{ background: 'var(--ink-900)', color: 'var(--ink-50)' }}
        >
          Nueva sesion
        </span>
      </button>

      {/* Nav rails */}
      <div style={{ height: 8 }} />
      <div className="flex flex-col items-center gap-1">
        <RailButton
          icon={<Search size={17} />}
          label="Buscar sesiones"
          onClick={onExpand}
        />
        <RailButton
          icon={<MessageSquare size={17} />}
          label="Conversaciones"
          onClick={onExpand}
        />
      </div>

      <div className="flex-1" />

      {/* SOS rail button — red-tinted */}
      <RailButton
        icon={<AlertTriangle size={17} />}
        label="Linea de crisis SOS"
        onClick={onOpenCrisis}
        tone="danger"
      />
      <div style={{ height: 4 }} />
      <RailButton
        icon={<Settings size={17} />}
        label="Configuracion"
        onClick={onOpenSettings}
      />
      <div style={{ height: 8 }} />

      {/* Profile avatar */}
      <button
        type="button"
        onClick={onOpenSettings}
        title={user?.display_name || user?.email || 'Cuenta'}
        aria-label="Cuenta"
        className="relative group/btn transition-transform hover:scale-[1.04]"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--mabel-600)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 11,
          fontFamily: 'var(--font-sans)',
          letterSpacing: '-0.01em',
        }}
      >
        {initials}
        <span
          className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md whitespace-nowrap text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 shadow-md z-50"
          role="tooltip"
          style={{ background: 'var(--ink-900)', color: 'var(--ink-50)' }}
        >
          {user?.display_name || user?.email || 'Cuenta'}
        </span>
      </button>
    </div>
  )
}
