import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  style?: CSSProperties
}

/**
 * Card — generic content container.
 *
 * - padding 18, border ink-200, radius 14, bg white by default
 * - Receives an optional `style` override (e.g. warn-50 bg for callouts)
 */
export default function Card({ children, style }: CardProps) {
  return (
    <div
      style={{
        padding: 18,
        border: '1px solid var(--ink-200)',
        borderRadius: 14,
        background: '#fff',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
