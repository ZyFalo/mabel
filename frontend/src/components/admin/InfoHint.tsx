import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

/**
 * Small "i" badge that opens a contextual tooltip on hover/focus.
 *
 * Use this to add discoverable explanations to metric cards, chart titles,
 * KPI labels, etc. The badge is deliberately low-contrast (var(--ink-300))
 * so it never competes with the metric itself — admins who already know
 * what the metric means barely notice it; admins who don't can hover to
 * get a one-line explanation.
 *
 * The tooltip is keyboard accessible (Tab to focus the button + Esc to
 * dismiss when focused), screen-reader friendly (aria-describedby points
 * at the tooltip text), and viewport-aware (flips to the left edge when it
 * would overflow the right edge of the container).
 */
interface InfoHintProps {
  /** Plain-text explanation. Keep it short (one or two sentences). */
  text: string
  /** Larger hit area for touch / accessibility. Defaults to false. */
  large?: boolean
  /** Optional extra class on the trigger button. */
  className?: string
}

export default function InfoHint({ text, large = false, className }: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()

  // Flip the tooltip to align by the right edge if the default left-anchored
  // position would overflow the viewport. Re-measured each time we open.
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const TOOLTIP_WIDTH_PX = 240
    const wouldOverflow = rect.left + TOOLTIP_WIDTH_PX > window.innerWidth - 8
    setAlignRight(wouldOverflow)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const size = large ? 16 : 13

  // Implemented as <span role="button"> instead of <button> on purpose:
  // InfoHint is often placed inside <MetricCard> which can itself render
  // as a <button> (when it has an onClick). HTML forbids nesting buttons,
  // and React emits a hydration error. A span with role/tabIndex/keyboard
  // handlers preserves accessibility (Tab focus, Enter/Space activation,
  // aria-describedby, Esc to close) without violating DOM nesting rules.
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      setOpen((prev) => !prev)
    }
  }

  function handleClick(e: MouseEvent<HTMLSpanElement>) {
    // Touch devices have no hover; click toggles the tooltip. We also
    // stop propagation so a click on the hint does NOT trigger the parent
    // MetricCard's onClick (which would navigate away).
    e.preventDefault()
    e.stopPropagation()
    setOpen((prev) => !prev)
  }

  return (
    <span
      className={['relative inline-flex items-center', className ?? ''].join(' ')}
    >
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label="Más información"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'transparent',
          border: '1px solid var(--ink-300)',
          color: 'var(--ink-400)',
          padding: 0,
          fontSize: Math.max(8, size - 5),
          lineHeight: 1,
          fontWeight: 700,
          fontFamily: 'serif',
          cursor: 'help',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          transition:
            'border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
        }}
        onMouseOver={(e) => {
          ;(e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--ink-500)'
          ;(e.currentTarget as HTMLSpanElement).style.color = 'var(--ink-700)'
        }}
        onMouseOut={(e) => {
          ;(e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--ink-300)'
          ;(e.currentTarget as HTMLSpanElement).style.color = 'var(--ink-400)'
        }}
      >
        i
      </span>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: 6,
            left: alignRight ? 'auto' : 0,
            right: alignRight ? 0 : 'auto',
            width: 240,
            maxWidth: 'min(240px, 90vw)',
            zIndex: 50,
            background: 'var(--ink-900)',
            color: 'var(--white, #fff)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 11.5,
            lineHeight: 1.45,
            boxShadow:
              '0 8px 24px -6px rgba(26, 17, 16, 0.18), 0 4px 8px -2px rgba(26, 17, 16, 0.10)',
            pointerEvents: 'none',
            fontFamily: 'var(--font-sans)',
            fontWeight: 400,
            letterSpacing: 0,
            textTransform: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
