interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}

/**
 * Toggle — animated switch primitive.
 *
 * Renders a button[role="switch"] with aria-checked. Track color uses
 * --accent when on and --border-strong when off. Thumb slides 20px right
 * when checked.
 */
export default function Toggle({ checked, onChange, disabled = false, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
      style={{
        backgroundColor: checked ? 'var(--accent)' : 'var(--border-strong)',
      }}
    >
      <span
        aria-hidden="true"
        className={[
          'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm',
          'transition-transform duration-200 ease-out',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  )
}
