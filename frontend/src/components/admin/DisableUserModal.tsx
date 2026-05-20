import { useEffect, useState } from 'react'
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
        message: 'Cuenta deshabilitada correctamente',
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
        setError(detail ?? 'No fue posible deshabilitar la cuenta. Intenta nuevamente.')
      }
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-accent/60 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disable-user-title"
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Header strip */}
        <div className="border-l-4 border-danger px-6 pt-5 pb-4 bg-danger/5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger/80">
            Accion administrativa
          </p>
          <h2
            id="disable-user-title"
            className="text-lg font-semibold text-text-primary mt-1"
          >
            Deshabilitar cuenta de usuario
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-primary/70 leading-relaxed">
            La cuenta no podra iniciar sesion hasta ser rehabilitada. Esta accion queda registrada
            en el log de auditoria. Indica una razon clara y verificable.
          </p>

          <div>
            <label
              htmlFor="disable-reason"
              className="block text-xs font-semibold uppercase tracking-wider text-text-primary/70 mb-1.5"
            >
              Razon de la deshabilitacion
              <span className="text-danger ml-1">*</span>
            </label>
            <textarea
              id="disable-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.slice(0, MAX_REASON_LENGTH))
                if (error) setError(null)
              }}
              placeholder="Ej.: Incumplimiento de los terminos de uso del servicio (uso inapropiado del chat reportado el 2026-05-18)."
              rows={4}
              disabled={submitting}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between mt-1.5">
              <p
                className={[
                  'text-xs',
                  trimmed.length === 0
                    ? 'text-text-primary/40'
                    : trimmed.length < MIN_REASON_LENGTH
                      ? 'text-warning'
                      : 'text-success',
                ].join(' ')}
              >
                {trimmed.length === 0
                  ? `Minimo ${MIN_REASON_LENGTH} caracteres`
                  : trimmed.length < MIN_REASON_LENGTH
                    ? `Faltan ${MIN_REASON_LENGTH - trimmed.length} caracteres`
                    : 'Razon valida'}
              </p>
              <p className="text-xs text-text-primary/40 tabular-nums">
                {reason.length}/{MAX_REASON_LENGTH}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="border border-danger/30 bg-danger/5 rounded-lg px-3 py-2.5 text-sm text-danger"
            >
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-text-primary/70 hover:text-text-primary hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-danger rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting && (
              <span
                className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"
                aria-hidden="true"
              />
            )}
            {submitting ? 'Deshabilitando...' : 'Deshabilitar cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}
