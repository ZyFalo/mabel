import { useState, type ReactNode } from 'react'

interface PrimaryButtonProps {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  disabled?: boolean
  type?: 'button' | 'submit'
}

/**
 * PrimaryButton — mabel-600 filled CTA.
 *
 * - 10px 18px padding, radius 10, font-size 13.5 weight 600
 * - Hover: mabel-700, shadow-sm
 * - Optional `icon` rendered to the left of children
 */
export default function PrimaryButton({
  children,
  onClick,
  icon,
  disabled,
  type = 'button',
}: PrimaryButtonProps) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 18px',
        background:
          disabled
            ? 'var(--ink-200)'
            : hover
              ? 'var(--mabel-700)'
              : 'var(--mabel-600)',
        color: '#fff',
        border: 'none',
        borderRadius: 10,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-sans)',
        boxShadow: disabled ? 'none' : 'var(--shadow-sm)',
        transition: 'background var(--dur-fast) var(--ease-out)',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  )
}
