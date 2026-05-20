import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface RevokeConsentModalProps {
  open: boolean
  onClose: () => void
  currentScope: string
}

export default function RevokeConsentModal({
  open,
  onClose,
  currentScope,
}: RevokeConsentModalProps) {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleReduceScope() {
    setLoading(true)
    try {
      await apiClient.patch('/consents/current', { action: 'reduce-scope' })
      addToast({ type: 'success', message: 'Scope actualizado a uso basico' })
      onClose()
    } catch {
      addToast({ type: 'error', message: 'Error al actualizar scope' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    setLoading(true)
    try {
      await apiClient.patch('/consents/current', { action: 'revoke' })
      localStorage.removeItem('mabel_token')
      localStorage.removeItem('mabel_user')
      navigate('/consent-required')
    } catch {
      addToast({ type: 'error', message: 'Error al revocar consentimiento' })
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg max-w-md w-full p-6 scale-in">
        <h2 className="text-[18px] font-display italic text-[var(--text-strong)] mb-1">
          Revocar consentimiento
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-5 leading-relaxed">
          La revocacion no implica eliminacion de cuenta ni de datos.
        </p>

        <div className="space-y-3 mb-5">
          {currentScope === 'uso_mejora_anon' && (
            <button
              onClick={handleReduceScope}
              disabled={loading}
              className="w-full p-4 border border-[var(--border)] rounded-xl text-left hover:bg-[var(--bg-hover)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
            >
              <p className="text-[14px] font-medium text-[var(--text-strong)]">
                Reducir a uso basico
              </p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
                Tus datos solo se usaran para el funcionamiento del sistema. Se excluyen de mejoras
                anonimas.
              </p>
            </button>
          )}

          <button
            onClick={handleRevoke}
            disabled={loading}
            className="w-full p-4 rounded-xl text-left transition-colors disabled:opacity-50 border"
            style={{
              borderColor: 'var(--danger)',
              backgroundColor: 'var(--bg-hover)',
            }}
          >
            <p className="text-[14px] font-medium" style={{ color: 'var(--danger)' }}>
              Revocar totalmente
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
              Perderas acceso temporal hasta re-aceptar el consentimiento. Tus datos no se eliminan.
            </p>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] text-[13px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
