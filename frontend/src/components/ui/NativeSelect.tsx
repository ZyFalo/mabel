import type { ReactNode } from 'react'

interface NativeSelectProps {
  value: string
  onChange: (next: string) => void
  children: ReactNode
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

/**
 * NativeSelect — native <select> styled with a custom chevron.
 *
 * Uses the native dropdown (better accessibility / mobile UX) but visually
 * blends with the design system: --bg-elevated background, --border edge,
 * inline SVG chevron on the right.
 */
export default function NativeSelect({
  value,
  onChange,
  children,
  disabled = false,
  id,
  ariaLabel,
}: NativeSelectProps) {
  return (
    <div className="relative inline-block">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={[
          'appearance-none rounded-lg border pl-3 pr-9 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-[var(--mabel-600)]/40 focus:border-[var(--mabel-600)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors duration-150',
        ].join(' ')}
        style={{
          backgroundColor: '#fff',
          borderColor: 'var(--ink-200)',
          color: 'var(--ink-900)',
        }}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4"
        style={{ color: 'var(--ink-500)' }}
      >
        <path
          d="M5 7.5 10 12.5 15 7.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
