import type { ComponentType, SVGProps } from 'react'

// Compatible with lucide-react icons and any SVG component. We avoid a hard
// dependency on lucide-react in this primitive so consumers can use any
// 24x24 SVG icon component.
export type SegmentedIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: SegmentedIcon
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
}

/**
 * Segmented — button group primitive with optional icon per option.
 *
 * Active item uses --bg-elevated + --text-strong + subtle shadow; inactive
 * uses --text-muted with hover lift.
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-lg p-1 border"
      style={{
        backgroundColor: 'var(--ink-100)',
        borderColor: 'var(--ink-100)',
      }}
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
              'transition-all duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mabel-600)]/40',
              isActive ? 'shadow-sm' : 'hover:scale-[1.02]',
            ].join(' ')}
            style={{
              backgroundColor: isActive ? '#fff' : 'transparent',
              color: isActive ? 'var(--ink-900)' : 'var(--ink-500)',
            }}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
