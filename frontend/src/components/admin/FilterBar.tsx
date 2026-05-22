import { ReactNode } from 'react'
import { X } from 'lucide-react'

interface FilterBarProps {
  children: ReactNode
  onReset?: () => void
  title?: string
}

export default function FilterBar({ children, onReset, title }: FilterBarProps) {
  return (
    <section
      aria-label={title ?? 'Filtros'}
      style={{
        background: 'var(--white)',
        border: '1px solid var(--ink-200)',
        borderRadius: 'var(--r-lg)',
        padding: '14px 16px',
        marginBottom: 16,
        fontFamily: 'var(--font-sans)',
      }}
    >
      {title && (
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--ink-500)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            margin: 0,
            marginBottom: 10,
          }}
        >
          {title}
        </p>
      )}
      <div className="flex flex-wrap items-end" style={{ gap: 12 }}>
        <div className="flex flex-wrap items-end flex-1 min-w-0" style={{ gap: 12 }}>
          {children}
        </div>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center"
            style={{
              gap: 4,
              padding: '6px 12px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--mabel-700)',
              background: 'var(--mabel-50)',
              border: '1px solid var(--mabel-200)',
              cursor: 'pointer',
              flexShrink: 0,
              transition:
                'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--mabel-100)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--mabel-50)'
            }}
          >
            <X size={12} />
            <span>Limpiar filtros</span>
          </button>
        )}
      </div>
    </section>
  )
}
