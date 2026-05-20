import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
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
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} aria-hidden />
      <div
        className="scale-in"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          width: 'min(100%, 480px)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px 26px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--danger-50)',
              color: 'var(--danger-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={26} />
          </div>
        </div>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 4px',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          Eliminar cuenta
        </h2>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center',
            color: 'var(--danger-600)',
            margin: '0 0 16px',
          }}
        >
          Esta accion es irreversible
        </p>
        <p style={{ fontSize: 13, color: 'var(--ink-600)', margin: '0 0 8px', lineHeight: 1.55 }}>
          Se eliminaran permanentemente:
        </p>
        <ul
          style={{
            fontSize: 12.5,
            color: 'var(--ink-600)',
            margin: '0 0 14px',
            paddingLeft: 18,
            lineHeight: 1.7,
          }}
        >
          <li>Todas tus conversaciones y mensajes</li>
          <li>Tus preferencias y configuracion</li>
          <li>Tu consentimiento y datos de cuenta</li>
          <li>Tus reportes de mensajes</li>
        </ul>
        <p style={{ fontSize: 11.5, color: 'var(--ink-400)', margin: '0 0 16px' }}>
          Los registros de seguridad se conservan de forma anonima.
        </p>

        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Escribe ELIMINAR para confirmar"
          style={{
            width: '100%',
            padding: '11px 14px',
            background: '#fff',
            border: `1px solid ${confirmation ? 'var(--danger-600)' : 'var(--ink-200)'}`,
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--ink-900)',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
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
            onClick={handleDelete}
            disabled={!isValid || deleting}
            style={{
              flex: 1,
              padding: '11px 18px',
              background: 'var(--danger-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !isValid || deleting ? 'not-allowed' : 'pointer',
              opacity: !isValid || deleting ? 0.45 : 1,
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 4px 12px -3px rgba(220,38,38,0.35)',
            }}
          >
            {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </button>
        </div>
      </div>
    </div>
  )
}
