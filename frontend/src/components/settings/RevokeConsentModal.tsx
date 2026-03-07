import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface RevokeConsentModalProps {
  open: boolean
  onClose: () => void
  currentScope: string
}

export default function RevokeConsentModal({ open, onClose, currentScope }: RevokeConsentModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-text-primary text-center mb-2">Revocar consentimiento</h2>
        <p className="text-sm text-text-primary/60 text-center mb-5">
          La revocacion no implica eliminacion de cuenta ni de datos.
        </p>

        <div className="space-y-3 mb-5">
          {currentScope === 'uso_mejora_anon' && (
            <button
              onClick={handleReduceScope}
              disabled={loading}
              className="w-full p-4 border border-gray-200 rounded-xl text-left hover:border-primary/30 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <p className="text-sm font-medium text-text-primary">Reducir a uso basico</p>
              <p className="text-xs text-text-primary/50 mt-1">
                Tus datos solo se usaran para el funcionamiento del sistema. Se excluyen de mejoras anonimas.
              </p>
            </button>
          )}

          <button
            onClick={handleRevoke}
            disabled={loading}
            className="w-full p-4 border border-danger/20 bg-danger/5 rounded-xl text-left hover:bg-danger/10 transition-colors disabled:opacity-50"
          >
            <p className="text-sm font-medium text-danger">Revocar totalmente</p>
            <p className="text-xs text-text-primary/50 mt-1">
              Perderas acceso temporal hasta re-aceptar el consentimiento. Tus datos no se eliminan.
            </p>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 border border-gray-200 text-sm font-medium rounded-lg text-text-primary hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
