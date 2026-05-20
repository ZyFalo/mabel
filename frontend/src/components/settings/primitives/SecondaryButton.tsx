import type { ReactNode } from 'react'

interface SecondaryButtonProps {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  disabled?: boolean
}

/**
 * SecondaryButton — outline variant in info-600.
 *
 * - White bg, info-600 border + text, radius 10
 * - Padding 9px 16px, font-size 13 weight 600
 */
export default function SecondaryButton({
  children,
  onClick,
  icon,
  disabled,
}: SecondaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 16px',
        background: '#fff',
        color: 'var(--info-600)',
        border: '1px solid var(--info-600)',
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  )
}
