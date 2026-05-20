import { ReactNode } from 'react'

interface FilterBarProps {
  children: ReactNode
  onReset?: () => void
  title?: string
}

export default function FilterBar({ children, onReset, title }: FilterBarProps) {
  return (
    <section
      aria-label={title ?? 'Filtros'}
      className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4"
    >
      {title && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 mb-2">
          {title}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">{children}</div>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-primary hover:underline px-2 py-1.5 shrink-0"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </section>
  )
}
