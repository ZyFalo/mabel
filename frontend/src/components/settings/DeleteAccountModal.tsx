import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg max-w-md w-full p-6 scale-in">
        <div className="flex justify-center mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-hover)' }}
          >
            <AlertTriangle size={24} style={{ color: 'var(--danger)' }} />
          </div>
        </div>

        <h2 className="text-[18px] font-display italic text-[var(--text-strong)] text-center mb-1">
          Eliminar cuenta
        </h2>
        <p
          className="text-[13px] font-medium text-center mb-3"
          style={{ color: 'var(--danger)' }}
        >
          Esta accion es irreversible
        </p>
        <p className="text-[13px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Se eliminaran permanentemente:
        </p>
        <ul className="text-[12px] text-[var(--text-muted)] mb-4 space-y-1 list-disc list-inside">
          <li>Todas tus conversaciones y mensajes</li>
          <li>Tus preferencias y configuracion</li>
          <li>Tu consentimiento y datos de cuenta</li>
          <li>Tus reportes de mensajes</li>
        </ul>
        <p className="text-[11px] text-[var(--text-faint)] mb-4">
          Los registros de seguridad se conservan de forma anonima.
        </p>

        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Escribe ELIMINAR para confirmar"
          className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:outline-none transition-colors mb-4"
          style={{
            borderColor: confirmation ? 'var(--danger)' : 'var(--border)',
          }}
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] text-[13px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={!isValid || deleting}
            className="flex-1 px-5 py-2.5 text-white text-[13px] font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}
