import { AlertTriangle } from 'lucide-react'
import type { CSSProperties } from 'react'

interface SosButtonProps {
  onClick: () => void
  /**
   * Layout context:
   *  - `inline`: drops into an existing flex header. No positioning.
   *  - `floating`: position fixed top-3 right-3 for pages without a header
   *    (Home, SessionEnd, etc.).
   */
  variant?: 'inline' | 'floating'
  /** Extra style overrides. */
  style?: CSSProperties
}

/**
 * Crisis access pill. Replaces the old bottom-right circular FAB.
 *
 * Mental-health UX rule: this button must be visible AT ALL TIMES on any
 * authenticated screen, in one tap, regardless of viewport. The label is
 * explicit ("SOS") and the visual hierarchy is high (solid danger red).
 *
 * Two layout variants because not every page has a header bar:
 *  - `inline` (default): use inside Chat / SessionDetail headers, alongside
 *    Info and MoreVertical buttons. Renders without any positioning.
 *  - `floating`: use on header-less pages (Home, SessionEnd). Renders
 *    fixed at top-right.
 */
export default function SosButton({
  onClick,
  variant = 'inline',
  style,
}: SosButtonProps) {
  const floatingStyles: CSSProperties =
    variant === 'floating'
      ? {
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 35,
        }
      : {}

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir línea de crisis SOS"
      title="Línea de crisis SOS"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'var(--danger-600)',
        color: '#fff',
        border: 'none',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        boxShadow: '0 1px 3px rgba(220, 38, 38, 0.25)',
        transition: 'background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
        flexShrink: 0,
        ...floatingStyles,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--danger-700)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--danger-600)'
      }}
    >
      <AlertTriangle size={13} strokeWidth={2.5} />
      SOS
    </button>
  )
}
