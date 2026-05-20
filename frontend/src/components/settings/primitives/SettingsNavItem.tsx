import { useState, type ReactNode } from 'react'

interface SettingsNavItemProps {
  icon: ReactNode
  title: string
  subtitle: string
  active: boolean
  onClick: () => void
}

/**
 * SettingsNavItem — sidebar row for the Settings overlay.
 *
 * - 34x34 icon chip rounded-9 (ink-100 inactive / mabel-100 active)
 * - Title 13.5px bold + subtitle 11.5px below
 * - Active row: bg mabel-50, color mabel-700; inactive: hover bg ink-100
 */
export default function SettingsNavItem({
  icon,
  title,
  subtitle,
  active,
  onClick,
}: SettingsNavItemProps) {
  const [hover, setHover] = useState(false)
  const bg = active
    ? 'var(--mabel-50)'
    : hover
      ? 'var(--ink-100)'
      : 'transparent'
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-current={active ? 'page' : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: bg,
        color: active ? 'var(--mabel-700)' : 'var(--ink-800)',
        border: 'none',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        textAlign: 'left',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: active ? 'var(--mabel-100)' : 'var(--ink-100)',
          color: active ? 'var(--mabel-700)' : 'var(--ink-600)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: active ? 'var(--mabel-600)' : 'var(--ink-400)',
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  )
}
