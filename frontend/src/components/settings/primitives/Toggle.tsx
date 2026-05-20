interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
}

/**
 * Toggle (Settings overlay variant) — labeled row with switch on the right.
 *
 * Differs from the base ui/Toggle by:
 *  - Including label + hint inline (left), switch (right)
 *  - 40x22 pill with 18x18 animated thumb (ink-200 off / mabel-600 on)
 *  - Bottom border ink-100 between rows
 *
 * Used only inside Settings sections.
 */
export default function Toggle({ checked, onChange, label, hint }: ToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '16px 0',
        borderBottom: '1px solid var(--ink-100)',
      }}
    >
      <div style={{ flex: 1, paddingRight: 16 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-900)',
          }}
        >
          {label}
        </div>
        {hint ? (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--ink-500)',
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          background: checked ? 'var(--mabel-600)' : 'var(--ink-200)',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'background var(--dur-base) var(--ease-out)',
          marginTop: 1,
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: '#fff',
            boxShadow: 'var(--shadow-sm)',
            transition: 'left var(--dur-base) var(--ease-out)',
          }}
        />
      </button>
    </div>
  )
}
