import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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

export interface LineSpec {
  key: string
  label?: string
  color?: string
}

interface LineChartWrapperProps {
  data: Array<{ date: string; value?: number; [k: string]: unknown }>
  lines: LineSpec[]
  yLabel?: string
  referenceLine?: number
  referenceLabel?: string
  height?: number
  /** Disable XAxis date formatting if `dateKey` is not a date string. */
  xKey?: string
  formatY?: (v: number) => string
}

export default function LineChartWrapper({
  data,
  lines,
  yLabel,
  referenceLine,
  referenceLabel,
  height = 260,
  xKey = 'date',
  formatY,
}: LineChartWrapperProps) {
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
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, left: yLabel ? 8 : 0, bottom: 4 }}
      >
        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: CHART_AXIS_STROKE, strokeOpacity: 0.4 }}
          tickFormatter={xKey === 'date' ? formatDateTick : undefined}
          minTickGap={24}
        />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={48}
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
          tickFormatter={formatY}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          labelFormatter={
            xKey === 'date'
              ? (label: unknown) => formatDateTick(label as string | number)
              : undefined
          }
        />
        {lines.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
        )}
        {referenceLine !== undefined && (
          <ReferenceLine
            y={referenceLine}
            stroke="#DC2626"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={
              referenceLabel
                ? {
                    value: referenceLabel,
                    position: 'right',
                    fill: '#DC2626',
                    fontSize: 10,
                    fontWeight: 600,
                  }
                : undefined
            }
          />
        )}
        {lines.map((line, idx) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label ?? line.key}
            stroke={line.color ?? CHART_PALETTE[idx % CHART_PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
