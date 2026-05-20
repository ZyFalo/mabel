import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  description?: string
  vertical?: boolean
  htmlFor?: string
  children: ReactNode
}

/**
 * Field — row wrapper for a control with label and optional description.
 *
 * By default the label sits to the left and the control to the right. When
 * `vertical` is true, the label stacks above the control (full-width).
 */
export default function Field({ label, description, vertical = false, htmlFor, children }: FieldProps) {
  if (vertical) {
    return (
      <div className="flex flex-col gap-2 py-3">
        <div className="flex flex-col gap-0.5">
          <label
            htmlFor={htmlFor}
            className="text-sm font-medium"
            style={{ color: 'var(--text-strong)' }}
          >
            {label}
          </label>
          {description ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {description}
            </p>
          ) : null}
        </div>
        <div>{children}</div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium"
          style={{ color: 'var(--text-strong)' }}
        >
          {label}
        </label>
        {description ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
