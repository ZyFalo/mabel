/**
 * Shared chart theme tokens for admin Recharts wrappers.
 * Aligned with the Mabel-IA brand-skin tokens (var(--mabel-*), var(--ink-*)).
 *
 * Note: Recharts requires literal color values (not CSS variables) for its
 * stroke/fill props, so we mirror the brand palette here as hex constants.
 * Keep these in sync with `index.css` when tokens evolve.
 */

export const CHART_COLORS = {
  primary: '#A51916', // var(--mabel-600)
  accent: '#3D332F', // var(--ink-700) — replaces legacy teal
  success: '#059669', // var(--success-600)
  warning: '#D97706', // var(--warn-600)
  danger: '#DC2626', // var(--danger-600)
  neutral: '#6B7280', // var(--ink-500)
  violet: '#7C3AED',
  cyan: '#0891B2',
  info: '#2563EB', // var(--info-600)
} as const

// Brand-aligned palette used when callers don't pin colors per series.
// Order matters: first colors are dominant brand reds + ink, secondary are
// semantic warm/cool accents.
export const CHART_PALETTE: string[] = [
  CHART_COLORS.primary,
  CHART_COLORS.accent,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.info,
  CHART_COLORS.violet,
  CHART_COLORS.cyan,
  CHART_COLORS.danger,
]

export const CHART_GRID_STROKE = '#E7E3E1' // var(--ink-200)
export const CHART_AXIS_STROKE = '#C8C2BF' // var(--ink-300)
export const CHART_AXIS_TEXT = '#6B7280' // var(--ink-500)

export const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: CHART_AXIS_TEXT,
  fontFamily: 'var(--font-sans), Nunito, system-ui, sans-serif',
} as const

export const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E7E3E1',
  borderRadius: 12,
  boxShadow: '0 8px 24px -6px rgba(26, 17, 16, 0.10), 0 4px 8px -2px rgba(26, 17, 16, 0.05)',
  fontSize: 12,
  padding: '8px 12px',
  fontFamily: 'var(--font-sans), Nunito, system-ui, sans-serif',
}

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: '#1A1110', // var(--ink-900)
  fontWeight: 700,
  marginBottom: 4,
  fontSize: 11,
  letterSpacing: '0.01em',
}

export const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: '#3D332F', // var(--ink-700)
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Format an ISO date string ("YYYY-MM-DD") to "dd MMM" in Spanish,
 * resilient to invalid input.
 *
 * Timezone trap: `new Date("YYYY-MM-DD")` is parsed as UTC midnight by
 * the JS spec. Rendering that in a browser at -05:00 (Bogotá) shifts
 * the day BACKWARDS — so a row labelled "2026-05-22" by the backend
 * would show as "21 may" in the chart axis (off-by-one). This bug
 * surfaced when the dashboard's "Activaciones de guardrails" chart
 * displayed today's 5 events under "21 de may" instead of "22 de may".
 *
 * Fix: split the ISO date into components and construct the Date in
 * the *local* timezone (the no-arg `Date` constructor honours local TZ
 * for Y/M/D inputs). Date-only strings without a time component are
 * always treated as a local calendar day from now on.
 */
export function formatDateTick(value: string | number): string {
  if (typeof value !== 'string') return String(value)
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  let d: Date
  if (dateOnlyMatch) {
    const y = Number(dateOnlyMatch[1])
    const m = Number(dateOnlyMatch[2]) - 1
    const day = Number(dateOnlyMatch[3])
    d = new Date(y, m, day)
  } else {
    d = new Date(value)
  }
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
