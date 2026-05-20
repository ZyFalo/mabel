/**
 * Shared chart theme tokens for admin Recharts wrappers.
 * Aligned with the Mabel-IA admin design system.
 */

export const CHART_COLORS = {
  primary: '#A51916',
  accent: '#0F303A',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  neutral: '#64748B',
  violet: '#7C3AED',
  cyan: '#0891B2',
} as const

export const CHART_PALETTE: string[] = [
  CHART_COLORS.accent,
  CHART_COLORS.primary,
  CHART_COLORS.warning,
  CHART_COLORS.success,
  CHART_COLORS.violet,
  CHART_COLORS.cyan,
  CHART_COLORS.danger,
  CHART_COLORS.neutral,
]

export const CHART_GRID_STROKE = '#E5E7EB'
export const CHART_AXIS_STROKE = '#94A3B8'
export const CHART_AXIS_TEXT = '#475569'

export const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: CHART_AXIS_TEXT,
  fontFamily: 'inherit',
} as const

export const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(15, 48, 58, 0.08)',
  fontSize: 12,
  padding: '8px 10px',
}

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: '#0F303A',
  fontWeight: 600,
  marginBottom: 2,
}

export const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: '#1F2937',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Format an ISO date string (YYYY-MM-DD) to "dd MMM" in Spanish,
 * resilient to invalid input.
 */
export function formatDateTick(value: string | number): string {
  if (typeof value !== 'string') return String(value)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
