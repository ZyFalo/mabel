import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface EnableUserModalProps {
  open: boolean
  userId: string
  userLabel?: string
  /** Opcional: razón previa de deshabilitación, sólo lectura para contexto. */
  previousReason?: string | null
  onClose: () => void
  onEnabled: () => void
}

/**
 * Confirmation modal for re-enabling a previously disabled user.
 *
 * Mirrors the visual language of `DisableUserModal` but uses the success
 * palette (green) and skips the reason textarea — re-enabling is a low-risk
 * reversal, so the action is single-click after explicit confirmation. The
 * previous disable reason is shown (read-only) when provided so the admin
 * can re-evaluate context before unlocking the account.
 */
export default function EnableUserModal({
  open,
  userId,
  userLabel,
  previousReason,
  onClose,
  onEnabled,
}: EnableUserModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (open) {
      setError(null)
      setSubmitting(false)
    }
  }, [open, userId])

  if (!open) return null

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.patch(`/admin/users/${userId}/enable`)
      addToast({ type: 'success', message: 'Cuenta reactivada correctamente.' })
      onEnabled()
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      const status = e?.response?.status
      const detail = e?.response?.data?.detail
      if (status === 409) {
        setError(detail ?? 'La cuenta ya se encuentra activa.')
      } else if (status === 404) {
        setError(detail ?? 'Usuario no encontrado.')
      } else {
        setError(detail ?? 'No fue posible reactivar la cuenta. Inténtalo nuevamente.')
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
        aria-labelledby="enable-user-title"
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
            background: 'var(--success-50)',
            borderBottom: '1px solid var(--success-200)',
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
                background: 'var(--success-200)',
                color: 'var(--success-700)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--success-700)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.16em',
                  margin: 0,
                  opacity: 0.85,
                }}
              >
                Acción administrativa
              </p>
              <h2
                id="enable-user-title"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--success-700)',
                  margin: 0,
                  marginTop: 4,
                  letterSpacing: '-0.01em',
                }}
              >
                Reactivar usuario
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
              color: 'var(--success-700)',
              background: 'transparent',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.4 : 0.8,
              flexShrink: 0,
              transition:
                'background var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (submitting) return
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(5, 150, 105, 0.12)'
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
        <div
          style={{
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <p style={{ fontSize: 13.5, color: 'var(--ink-600)', margin: 0, lineHeight: 1.55 }}>
            {userLabel ? (
              <>
                Vas a reactivar la cuenta de{' '}
                <span style={{ color: 'var(--ink-900)', fontWeight: 600 }}>{userLabel}</span>.{' '}
              </>
            ) : (
              'Vas a reactivar esta cuenta. '
            )}
            Podrá iniciar sesión y usar Mabel IA con normalidad. La acción queda registrada en
            el log de auditoría junto con la razón original de la deshabilitación.
          </p>

          {previousReason && (
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--ink-600)',
                  marginBottom: 6,
                }}
              >
                Razón de la deshabilitación previa
              </p>
              <div
                style={{
                  background: 'var(--ink-50)',
                  border: '1px solid var(--ink-200)',
                  borderRadius: 'var(--r-md)',
                  padding: '10px 12px',
                  fontSize: 13,
                  color: 'var(--ink-700)',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {previousReason}
              </div>
            </div>
          )}

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
              transition:
                'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
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
            disabled={submitting}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--white)',
              background: 'var(--success-600)',
              borderRadius: 9999,
              border: '1px solid var(--success-600)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
              transition:
                'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (submitting) return
              ;(e.currentTarget as HTMLElement).style.background = 'var(--success-700)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--success-700)'
              ;(e.currentTarget as HTMLElement).style.boxShadow =
                '0 0 0 4px rgba(5, 150, 105, 0.18)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--success-600)'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--success-600)'
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
            <span>{submitting ? 'Reactivando…' : 'Reactivar cuenta'}</span>
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
