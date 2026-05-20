import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  CHART_PALETTE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
} from './chartTheme'

interface DonutDatum {
  name: string
  value: number
  color?: string
}

interface DonutChartWrapperProps {
  data: DonutDatum[]
  height?: number
  /** Optional centered label inside the donut hole (e.g. total). */
  centerLabel?: string
  centerSubLabel?: string
}

export default function DonutChartWrapper({
  data,
  height = 260,
  centerLabel,
  centerSubLabel,
}: DonutChartWrapperProps) {
  const total = data.reduce((acc, d) => acc + (d.value || 0), 0)

  if (!data || data.length === 0 || total === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-text-primary/40 italic"
      >
        Sin datos suficientes
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="#FFFFFF"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={entry.color ?? CHART_PALETTE[idx % CHART_PALETTE.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: unknown, name: unknown) => {
              const num = typeof value === 'number' ? value : Number(value) || 0
              const pct = total > 0 ? ((num / total) * 100).toFixed(1) : '0'
              return [`${num} (${pct}%)`, String(name ?? '')]
            }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {(centerLabel || centerSubLabel) && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingBottom: 28 }}
        >
          {centerLabel && (
            <span className="text-2xl font-semibold text-text-primary tabular-nums leading-none">
              {centerLabel}
            </span>
          )}
          {centerSubLabel && (
            <span className="text-[10px] uppercase tracking-wider text-text-primary/50 mt-1">
              {centerSubLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
