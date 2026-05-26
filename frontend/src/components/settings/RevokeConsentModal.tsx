import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
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
      // NO borramos el token: el JWT sigue siendo válido tras revocar
      // (la sesión sigue siendo del mismo usuario, solo cambia el
      // estado del consent). Borrar el token + navigate provocaba un
      // loop: ConsentRequired.tsx pegaba a /users/me/consent-status
      // sin Authorization → 401 → SessionExpiredModal → click "Ir al
      // login" → PublicRoute leía isAuthenticated:true del Zustand
      // (no se había limpiado) → redirect a /home → otro 401 → loop.
      // Bug fix 2026-05-25.
      // El backend (`require_consent`) responderá 403 con
      // detail.consent_status='revoked' en la próxima ruta protegida;
      // ConsentRequired carga su variante "revoked" sin problema.
      navigate('/consent-required')
    } catch {
      addToast({ type: 'error', message: 'Error al revocar consentimiento' })
      setLoading(false)
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

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 4px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          Revocar consentimiento
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 18px', lineHeight: 1.55 }}>
          La revocacion no implica eliminacion de cuenta ni de datos.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {currentScope === 'uso_mejora_anon' && (
            <button
              onClick={handleReduceScope}
              disabled={loading}
              style={{
                width: '100%',
                padding: 16,
                textAlign: 'left',
                background: '#fff',
                border: '1px solid var(--ink-200)',
                borderRadius: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'all var(--dur-fast) var(--ease-out)',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = 'var(--mabel-50)'
                  e.currentTarget.style.borderColor = 'var(--mabel-300)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#fff'
                  e.currentTarget.style.borderColor = 'var(--ink-200)'
                }
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', margin: 0 }}>
                Reducir a uso basico
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--ink-500)',
                  margin: '4px 0 0',
                  lineHeight: 1.5,
                }}
              >
                Tus datos solo se usaran para el funcionamiento del sistema. Se excluyen de mejoras
                anonimas.
              </p>
            </button>
          )}

          <button
            onClick={handleRevoke}
            disabled={loading}
            style={{
              width: '100%',
              padding: 16,
              textAlign: 'left',
              background: 'var(--danger-50)',
              border: '1px solid var(--danger-200)',
              borderRadius: 12,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              transition: 'all var(--dur-fast) var(--ease-out)',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.borderColor = 'var(--danger-600)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.borderColor = 'var(--danger-200)'
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger-700)', margin: 0 }}>
              Revocar totalmente
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-600)', margin: '4px 0 0', lineHeight: 1.5 }}>
              Perderas acceso temporal hasta re-aceptar el consentimiento. Tus datos no se eliminan.
            </p>
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '11px',
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
      </div>
    </div>
  )
}
