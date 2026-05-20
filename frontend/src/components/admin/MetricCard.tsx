interface MetricCardProps {
  label: string
  value: string | number
  threshold?: 'green' | 'yellow' | 'red'
  trend?: 'up' | 'down' | 'neutral'
  badge?: string
  hint?: string
  onClick?: () => void
}

const THRESHOLD_STYLES: Record<NonNullable<MetricCardProps['threshold']>, { value: string; dot: string }> = {
  green: { value: 'text-success', dot: 'bg-success' },
  yellow: { value: 'text-warning', dot: 'bg-warning' },
  red: { value: 'text-danger', dot: 'bg-danger' },
}

function TrendIcon({ trend }: { trend: NonNullable<MetricCardProps['trend']> }) {
  if (trend === 'up') {
    return (
      <span aria-label="Tendencia al alza" className="inline-flex items-center text-success text-xs">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span aria-label="Tendencia a la baja" className="inline-flex items-center text-danger text-xs">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  return (
    <span aria-label="Tendencia estable" className="inline-flex items-center text-text-primary/50 text-xs">
      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
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
  onClick,
}: MetricCardProps) {
  const tStyle = threshold ? THRESHOLD_STYLES[threshold] : null
  const Container = onClick ? 'button' : 'div'

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2 text-left w-full',
        onClick ? 'hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {tStyle && <span className={`w-2 h-2 rounded-full ${tStyle.dot} shrink-0`} aria-hidden="true" />}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60 truncate">
            {label}
          </p>
        </div>
        {badge && (
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-[10px] rounded-full font-medium shrink-0">
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span
          className={[
            'text-3xl font-semibold leading-none tabular-nums',
            tStyle ? tStyle.value : 'text-text-primary',
          ].join(' ')}
        >
          {value}
        </span>
        {trend && <TrendIcon trend={trend} />}
      </div>

      {hint && <p className="text-xs text-text-primary/50">{hint}</p>}
    </Container>
  )
}
