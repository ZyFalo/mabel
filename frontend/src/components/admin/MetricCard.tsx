import InfoHint from './InfoHint'

interface MetricCardProps {
  label: string
  value: string | number
  threshold?: 'green' | 'yellow' | 'red'
  trend?: 'up' | 'down' | 'neutral'
  badge?: string
  hint?: string
  /**
   * Optional one-line explanation surfaced as a hover tooltip via the
   * `i` icon next to the label. Use it to describe what the metric
   * measures, how it's calculated, or why it matters operationally.
   */
  info?: string
  onClick?: () => void
}

const THRESHOLD_DOT: Record<NonNullable<MetricCardProps['threshold']>, string> = {
  green: 'var(--success-600)',
  yellow: 'var(--warn-600)',
  red: 'var(--danger-600)',
}

const THRESHOLD_VALUE_COLOR: Record<NonNullable<MetricCardProps['threshold']>, string> = {
  green: 'var(--ink-900)',
  yellow: 'var(--ink-900)',
  red: 'var(--danger-700)',
}

function TrendIcon({ trend }: { trend: NonNullable<MetricCardProps['trend']> }) {
  if (trend === 'up') {
    return (
      <span aria-label="Tendencia al alza" style={{ color: 'var(--success-600)', display: 'inline-flex' }}>
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span aria-label="Tendencia a la baja" style={{ color: 'var(--danger-600)', display: 'inline-flex' }}>
        <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  return (
    <span aria-label="Tendencia estable" style={{ color: 'var(--ink-400)', display: 'inline-flex' }}>
      <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
        <path d="M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export default function MetricCard({
  label,
  value,
  threshold,
  trend,
  badge,
  hint,
  info,
  onClick,
}: MetricCardProps) {
  const dotColor = threshold ? THRESHOLD_DOT[threshold] : null
  const valueColor = threshold ? THRESHOLD_VALUE_COLOR[threshold] : 'var(--ink-900)'
  const Container = onClick ? 'button' : 'div'

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className="text-left w-full fade-in"
      style={{
        background: 'var(--white)',
        border: '1px solid var(--ink-200)',
        borderRadius: 'var(--r-lg)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: onClick ? 'pointer' : 'default',
        transition:
          'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
        fontFamily: 'var(--font-sans)',
      }}
      onMouseEnter={
        onClick
          ? (e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--mabel-300)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-brand)'
            }
          : undefined
      }
      onMouseLeave={
        onClick
          ? (e) => {
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-200)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between" style={{ gap: 8 }}>
        <div className="flex items-center" style={{ gap: 6, minWidth: 0 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--ink-500)',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              margin: 0,
              lineHeight: 1.4,
            }}
            className="truncate"
          >
            {label}
          </p>
          {info && <InfoHint text={info} />}
        </div>
        {badge && (
          <span
            style={{
              flexShrink: 0,
              padding: '2px 8px',
              background: 'var(--success-50)',
              color: 'var(--success-700)',
              border: '1px solid var(--success-200)',
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline" style={{ gap: 8 }}>
        {dotColor && (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
              display: 'inline-block',
              alignSelf: 'center',
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 28,
            lineHeight: 1.05,
            fontWeight: 700,
            color: valueColor,
            fontFeatureSettings: '"tnum"',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {trend && <TrendIcon trend={trend} />}
      </div>

      {hint && (
        <p
          style={{
            fontSize: 11.5,
            color: 'var(--ink-500)',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </p>
      )}
    </Container>
  )
}
