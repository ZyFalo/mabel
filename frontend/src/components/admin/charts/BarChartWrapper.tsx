import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AXIS_TICK_STYLE,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_PALETTE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  formatDateTick,
} from './chartTheme'

export interface BarSpec {
  key: string
  label?: string
  color?: string
  stackId?: string
}

interface BarChartWrapperProps {
  data: Array<Record<string, unknown>>
  bars: BarSpec[]
  xKey: string
  yLabel?: string
  height?: number
  /** When true, attempt to format xKey as a date label */
  formatXAsDate?: boolean
  formatY?: (v: number) => string
}

export default function BarChartWrapper({
  data,
  bars,
  xKey,
  yLabel,
  height = 260,
  formatXAsDate = false,
  formatY,
}: BarChartWrapperProps) {
  if (!data || data.length === 0) {
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
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, left: yLabel ? 8 : 0, bottom: 4 }}
        barCategoryGap="22%"
      >
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: CHART_AXIS_STROKE, strokeOpacity: 0.4 }}
          tickFormatter={formatXAsDate ? formatDateTick : undefined}
          minTickGap={20}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={48}
          allowDecimals={false}
          tickFormatter={formatY}
          label={
            yLabel
              ? {
                  value: yLabel,
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: '#64748B',
                  offset: 10,
                }
              : undefined
          }
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelFormatter={
            formatXAsDate
              ? (label: unknown) => formatDateTick(label as string | number)
              : undefined
          }
          cursor={{ fill: 'rgba(15, 48, 58, 0.05)' }}
        />
        {bars.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
        )}
        {bars.map((bar, idx) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label ?? bar.key}
            stackId={bar.stackId}
            fill={bar.color ?? CHART_PALETTE[idx % CHART_PALETTE.length]}
            radius={bar.stackId ? [0, 0, 0, 0] : [3, 3, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
