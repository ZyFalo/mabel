import { useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps {
  value: string
  onChange?: (next: string) => void
  type?: 'text' | 'password' | 'email' | 'tel'
  placeholder?: string
  prefix?: ReactNode
  suffix?: ReactNode
  error?: string
  readOnly?: boolean
  ariaLabel?: string
}

/**
 * Input — settings overlay form input.
 *
 * - White bg, ink-200 border (focused mabel-500 + ring-mabel glow)
 * - Optional prefix icon slot (rendered to the left, ink-400)
 * - Optional suffix slot (rendered to the right)
 * - Password type: eye toggle to reveal/hide
 * - Inline error message in danger-600 below
 */
export default function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  prefix,
  suffix,
  error,
  readOnly,
  ariaLabel,
}: InputProps) {
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  const isPass = type === 'password'
  const inputType = isPass && !shown ? 'password' : type === 'password' ? 'text' : type
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: '#fff',
          border: `1px solid ${
            error
              ? 'var(--danger-600)'
              : focused
                ? 'var(--mabel-500)'
                : 'var(--ink-200)'
          }`,
          borderRadius: 10,
          boxShadow: focused ? 'var(--ring-mabel)' : 'none',
          transition: 'all var(--dur-fast) var(--ease-out)',
        }}
      >
        {prefix ? (
          <div
            style={{
              color: 'var(--ink-400)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {prefix}
          </div>
        ) : null}
        <input
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          type={inputType}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-label={ariaLabel}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--ink-900)',
          }}
        />
        {isPass ? (
          <button
            onClick={() => setShown((s) => !s)}
            type="button"
            aria-label={shown ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-400)',
              padding: 0,
              display: 'flex',
            }}
          >
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        ) : null}
        {suffix ? <div style={{ color: 'var(--ink-400)' }}>{suffix}</div> : null}
      </div>
      {error ? (
        <div
          style={{
            fontSize: 12,
            color: 'var(--danger-600)',
            marginTop: 5,
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  )
}
