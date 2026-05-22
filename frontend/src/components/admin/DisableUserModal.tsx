import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface DisableUserModalProps {
  open: boolean
  userId: string
  onClose: () => void
  onDisabled: () => void
}

const MIN_REASON_LENGTH = 10
const MAX_REASON_LENGTH = 500

export default function DisableUserModal({
  open,
  userId,
  onClose,
  onDisabled,
}: DisableUserModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Reset state every time the modal opens for a new user
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, userId])

  if (!open) return null

  const trimmed = reason.trim()
  const canSubmit = trimmed.length >= MIN_REASON_LENGTH && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.patch(`/admin/users/${userId}/disable`, { reason: trimmed })
      addToast({
        type: 'success',
        message: 'Cuenta deshabilitada correctamente.',
      })
      onDisabled()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      const status = e?.response?.status
      const detail = e?.response?.data?.detail
      if (status === 403) {
        setError(
          detail ?? 'No es posible deshabilitar esta cuenta (cuenta administrativa protegida).',
        )
      } else if (status === 409) {
        setError(detail ?? 'La cuenta ya se encuentra deshabilitada.')
      } else {
        setError(detail ?? 'No fue posible deshabilitar la cuenta. Inténtalo nuevamente.')
      }
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: 16, fontFamily: 'var(--font-sans)' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 fade-in"
        style={{
          background: 'rgba(26, 17, 16, 0.45)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disable-user-title"
        className="relative scale-in"
        style={{
          background: 'var(--white)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-xl)',
          width: '100%',
          maxWidth: 480,
          overflow: 'hidden',
        }}
      >
        {/* Header band */}
        <div
          style={{
            background: 'var(--danger-50)',
            borderBottom: '1px solid var(--danger-200)',
            padding: '18px 22px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div className="flex items-start" style={{ gap: 12 }}>
            <span
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--danger-200)',
                color: 'var(--danger-700)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--danger-700)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.16em',
                  margin: 0,
                  opacity: 0.85,
                }}
              >
                Acción administrativa
              </p>
              <h2
                id="disable-user-title"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--danger-700)',
                  margin: 0,
                  marginTop: 4,
                  letterSpacing: '-0.01em',
                }}
              >
                Deshabilitar usuario
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Cerrar"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              color: 'var(--danger-700)',
              background: 'transparent',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.4 : 0.8,
              flexShrink: 0,
              transition: 'background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (submitting) return
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(220, 38, 38, 0.12)'
              ;(e.currentTarget as HTMLElement).style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLElement).style.opacity = submitting ? '0.4' : '0.8'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13.5, color: 'var(--ink-600)', margin: 0, lineHeight: 1.55 }}>
            La cuenta no podrá iniciar sesión hasta que un administrador la rehabilite. Esta acción
            queda registrada en el log de auditoría. Indica una razón clara y verificable.
          </p>

          <div>
            <label
              htmlFor="disable-reason"
              style={{
                display: 'block',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--ink-600)',
                marginBottom: 6,
              }}
            >
              Razón de la deshabilitación
              <span style={{ color: 'var(--danger-600)', marginLeft: 4 }}>*</span>
            </label>
            <textarea
              id="disable-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.slice(0, MAX_REASON_LENGTH))
                if (error) setError(null)
              }}
              placeholder="Ej.: Incumplimiento de los términos de uso del servicio (uso inapropiado del chat reportado el 2026-05-18)."
              rows={4}
              disabled={submitting}
              style={{
                width: '100%',
                border: '1px solid var(--ink-200)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                fontSize: 13.5,
                color: 'var(--ink-900)',
                background: submitting ? 'var(--ink-50)' : 'var(--white)',
                resize: 'none',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
                transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--mabel-600)'
                e.currentTarget.style.boxShadow = 'var(--ring-mabel)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--ink-200)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
              <p
                style={{
                  fontSize: 11,
                  margin: 0,
                  color:
                    trimmed.length === 0
                      ? 'var(--ink-400)'
                      : trimmed.length < MIN_REASON_LENGTH
                        ? 'var(--warn-700)'
                        : 'var(--success-700)',
                }}
              >
                {trimmed.length === 0
                  ? `Mínimo ${MIN_REASON_LENGTH} caracteres`
                  : trimmed.length < MIN_REASON_LENGTH
                    ? `Faltan ${MIN_REASON_LENGTH - trimmed.length} caracteres`
                    : 'Razón válida'}
              </p>
              <p
                style={{
                  fontSize: 11,
                  margin: 0,
                  color: 'var(--ink-400)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {reason.length}/{MAX_REASON_LENGTH}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                border: '1px solid var(--danger-200)',
                background: 'var(--danger-50)',
                color: 'var(--danger-700)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            background: 'var(--ink-50)',
            borderTop: '1px solid var(--ink-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-600)',
              background: 'transparent',
              borderRadius: 9999,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (submitting) return
              ;(e.currentTarget as HTMLElement).style.background = 'var(--ink-100)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-900)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--ink-600)'
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--white)',
              background: 'var(--danger-600)',
              borderRadius: 9999,
              border: '1px solid var(--danger-600)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
              transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (!canSubmit) return
              ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-700)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--danger-700)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--ring-danger)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-600)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--danger-600)'
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}
          >
            {submitting && (
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: 'var(--white)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            )}
            <span>{submitting ? 'Deshabilitando…' : 'Deshabilitar cuenta'}</span>
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
