import type { ReactNode } from 'react'

interface SettingsFieldProps {
  label: string
  hint?: string
  children: ReactNode
}

/**
 * SettingsField — label + control + optional hint, vertical layout.
 *
 * Used inside Settings overlay sections for fields that present a single
 * control (Input, NativeSelect, Segmented) below their label.
 */
export default function SettingsField({ label, hint, children }: SettingsFieldProps) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink-900)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
      {hint ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-500)',
            marginTop: 5,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}
