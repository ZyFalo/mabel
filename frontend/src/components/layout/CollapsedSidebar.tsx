import { useNavigate } from 'react-router-dom'
import {
  PanelLeft,
  Plus,
  Search,
  MessageSquare,
  Palette,
  Settings,
} from 'lucide-react'

interface CollapsedSidebarProps {
  onExpand: () => void
  onNewChat: () => void
  onOpenSettings: () => void
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
  variant?: 'default' | 'prominent'
}

function RailButton({ icon, label, onClick, variant = 'default' }: RailButtonProps) {
  const base =
    'relative group/btn w-9 h-9 flex items-center justify-center rounded-lg transition-colors'
  const styles =
    variant === 'prominent'
      ? 'bg-[#fff] border border-[var(--ink-200)] text-[var(--mabel-600)] hover:bg-[var(--ink-100)] shadow-sm'
      : 'text-[var(--ink-500)] hover:text-[var(--ink-900)] hover:bg-[var(--ink-100)]'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${base} ${styles}`}
    >
      {icon}
      <span
        className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md whitespace-nowrap text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 bg-[var(--ink-900)] text-[var(--ink-50)] shadow-md z-50"
        role="tooltip"
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
  user,
}: CollapsedSidebarProps) {
  const navigate = useNavigate()
  const initials = getInitials(user?.display_name, user?.email)

  return (
    <div className="h-full w-[56px] flex flex-col items-center py-3 bg-[var(--ink-50)]">
      {/* Top group */}
      <div className="flex flex-col items-center gap-1.5">
        <RailButton
          icon={<PanelLeft size={16} />}
          label="Expandir sidebar"
          onClick={onExpand}
        />
        <div className="h-1" />
        <RailButton
          icon={<Plus size={16} />}
          label="Nueva conversacion"
          onClick={onNewChat}
          variant="prominent"
        />
        <RailButton
          icon={<Search size={16} />}
          label="Buscar chats"
          onClick={onExpand}
        />
        <RailButton
          icon={<MessageSquare size={16} />}
          label="Chats recientes"
          onClick={onExpand}
        />
        <RailButton
          icon={<Palette size={16} />}
          label="Preferencias"
          onClick={onOpenSettings}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom group */}
      <div className="flex flex-col items-center gap-1.5">
        <RailButton
          icon={<Settings size={16} />}
          label="Configuracion"
          onClick={onOpenSettings}
        />
        <button
          type="button"
          onClick={() => navigate('/settings')}
          title={user?.display_name || user?.email || 'Cuenta'}
          aria-label="Cuenta"
          className="relative group/btn w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.04]"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--mabel-600) 0%, color-mix(in srgb, var(--mabel-600) 60%, black) 100%)',
          }}
        >
          {initials}
          <span
            className="pointer-events-none absolute left-full ml-3 px-2 py-1 rounded-md whitespace-nowrap text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-opacity duration-150 bg-[var(--ink-900)] text-[var(--ink-50)] shadow-md z-50"
            role="tooltip"
          >
            {user?.display_name || user?.email || 'Cuenta'}
          </span>
        </button>
      </div>
    </div>
  )
}
