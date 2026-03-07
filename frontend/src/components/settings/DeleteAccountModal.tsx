import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface DeleteAccountModalProps {
  open: boolean
  onClose: () => void
}

export default function DeleteAccountModal({ open, onClose }: DeleteAccountModalProps) {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (!open) return null

  const isValid = confirmation === 'ELIMINAR'

  async function handleDelete() {
    setDeleting(true)
    try {
      await apiClient.delete('/users/me', { data: { confirmation } })
      localStorage.removeItem('mabel_token')
      localStorage.removeItem('mabel_user')
      navigate('/')
    } catch {
      addToast({ type: 'error', message: 'Error al eliminar la cuenta' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <svg className="w-12 h-12 text-danger mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>

        <h2 className="text-lg font-bold text-text-primary text-center mb-2">Eliminar cuenta</h2>
        <p className="text-sm text-danger font-medium text-center mb-3">
          Esta accion es irreversible
        </p>
        <p className="text-sm text-text-primary/60 mb-4">
          Se eliminaran permanentemente:
        </p>
        <ul className="text-xs text-text-primary/50 mb-4 space-y-1 list-disc list-inside">
          <li>Todas tus conversaciones y mensajes</li>
          <li>Tus preferencias y configuracion</li>
          <li>Tu consentimiento y datos de cuenta</li>
          <li>Tus reportes de mensajes</li>
        </ul>
        <p className="text-xs text-text-primary/40 mb-4">
          Los registros de seguridad se conservan de forma anonima.
        </p>

        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder='Escribe ELIMINAR para confirmar'
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-4 focus:border-danger focus:ring-1 focus:ring-danger"
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-sm font-medium rounded-lg text-text-primary hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!isValid || deleting}
            className="flex-1 py-2.5 bg-danger text-white text-sm font-medium rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}
