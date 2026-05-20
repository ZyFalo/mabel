import { useState } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: 'simple' | 'verification'
  verificationText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'simple',
  verificationText = 'ELIMINAR',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [input, setInput] = useState('')

  if (!open) return null

  const canConfirm = variant === 'simple' || input === verificationText

  function handleConfirm() {
    if (!canConfirm) return
    setInput('')
    onConfirm()
  }

  function handleCancel() {
    setInput('')
    onCancel()
  }

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(26,17,16,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }} onClick={handleCancel} aria-hidden />
      <div
        className="scale-in"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          width: 'min(100%, 460px)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px 26px',
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 8px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--ink-600)',
            margin: '0 0 18px',
            lineHeight: 1.6,
          }}
        >
          {message}
        </p>

        {variant === 'verification' && (
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                fontSize: 13,
                color: 'var(--ink-600)',
                display: 'block',
                marginBottom: 6,
              }}
            >
              Escribe{' '}
              <strong style={{ color: 'var(--ink-900)' }}>{verificationText}</strong> para confirmar
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={verificationText}
              style={{
                width: '100%',
                padding: '11px 14px',
                background: '#fff',
                border: '1px solid var(--ink-200)',
                borderRadius: 10,
                fontSize: 14,
                color: 'var(--ink-900)',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--mabel-600)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ink-200)')}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '11px 18px',
              background: 'transparent',
              color: 'var(--ink-700)',
              border: '1px solid var(--ink-300)',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              padding: '11px 18px',
              background: 'var(--danger-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !canConfirm ? 'not-allowed' : 'pointer',
              opacity: !canConfirm ? 0.5 : 1,
              fontFamily: 'var(--font-sans)',
              boxShadow: !canConfirm ? 'none' : '0 4px 12px -3px rgba(220,38,38,0.35)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
