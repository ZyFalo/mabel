import LineChartWrapper, { LineSpec } from './LineChartWrapper'

interface MetricLineWithReferenceProps {
  data: Array<{ date: string; [k: string]: unknown }>
  lines: LineSpec[]
  reference: number
  referenceLabel?: string
  yLabel?: string
  height?: number
  formatY?: (v: number) => string
}

/**
 * Convenience wrapper around LineChartWrapper that always renders a horizontal
 * reference threshold (e.g. 20s latency target).
 */
export default function MetricLineWithReference({
  data,
  lines,
  reference,
  referenceLabel,
  yLabel,
  height,
  formatY,
}: MetricLineWithReferenceProps) {
  return (
    <LineChartWrapper
      data={data}
      lines={lines}
      yLabel={yLabel}
      referenceLine={reference}
      referenceLabel={referenceLabel}
      height={height}
      formatY={formatY}
    />
  )
}
