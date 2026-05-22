import { useEffect, useState } from 'react'
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
  // Recharts' ResponsiveContainer logs `width(-1) height(-1) of chart
  // should be greater than 0` on the first render when the parent flex/grid
  // item hasn't finalized its size yet. `minWidth/minHeight={0}` alone does
  // not silence this in all layouts (it only relaxes the guard, not the
  // warning timing). We gate the chart on a post-mount flag so the
  // container is guaranteed to have a measured size before Recharts
  // probes it. A same-height placeholder keeps the layout from jumping.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

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

  if (!mounted) {
    return <div className="relative w-full" style={{ height }} />
  }

  return (
    <div
      className="relative w-full"
      style={{ height, minWidth: 0, minHeight: 0 }}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={0}
      >
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
            // Recharts <Legend> with a Pie picks up the dataKey ("value")
            // as the label by default instead of nameKey — surfaced as
            // "value, value, value" in every slice. The formatter receives
            // `(value, entry)` and lets us substitute the real category
            // name from the entry's payload.
            formatter={(_value: unknown, entry: unknown) => {
              const payload = (entry as { payload?: { name?: string } })?.payload
              return payload?.name ?? String(_value ?? '')
            }}
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
