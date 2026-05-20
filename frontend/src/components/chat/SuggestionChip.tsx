import type { LucideIcon } from 'lucide-react'

interface SuggestionChipProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}

/**
 * SuggestionChip — Cap 6.3, pill button for Home suggestion prompts.
 * White bg + ink-200 border + 13px ink-700, hover mabel-50 bg + mabel-300 border + mabel-700 text.
 */
export default function SuggestionChip({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 14px',
        whiteSpace: 'nowrap',
        background: '#fff',
        border: '1px solid var(--ink-200)',
        borderRadius: 999,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--ink-700)',
        transition: 'all var(--dur-fast) var(--ease-out)',
        boxShadow: 'var(--shadow-xs)',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.borderColor = 'var(--mabel-300)'
        e.currentTarget.style.background = 'var(--mabel-50)'
        e.currentTarget.style.color = 'var(--mabel-700)'
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        e.currentTarget.style.borderColor = 'var(--ink-200)'
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.color = 'var(--ink-700)'
      }}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  )
}
