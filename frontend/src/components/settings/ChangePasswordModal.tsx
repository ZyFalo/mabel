import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'
import Input from './primitives/Input'
import PrimaryButton from './primitives/PrimaryButton'

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
}

function getStrength(pw: string): { score: number; label: string; varName: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Debil', varName: 'var(--danger-600)' }
  if (score <= 2) return { score, label: 'Media', varName: 'var(--warn-600)' }
  if (score <= 3) return { score, label: 'Buena', varName: 'var(--mabel-600)' }
  return { score, label: 'Fuerte', varName: 'var(--success-600)' }
}

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const strength = getStrength(newPassword)
  const passwordsMatch = newPassword === confirmPassword
  const isValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^a-zA-Z0-9]/.test(newPassword) &&
    passwordsMatch &&
    confirmPassword.length > 0

  async function handleSubmit() {
    setError('')
    setSaving(true)
    try {
      await apiClient.put('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      addToast({ type: 'success', message: 'Contrasena actualizada' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { detail?: string } } })?.response?.status
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (status === 401) {
        setError('Contrasena actual incorrecta')
      } else if (status === 400) {
        setError(detail || 'Error al cambiar contrasena')
      } else {
        setError('Error al cambiar contrasena')
      }
    } finally {
      setSaving(false)
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
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
        aria-hidden
      />
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
          Cambiar contrasena
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 18px', lineHeight: 1.55 }}>
          Asegurate de elegir una contrasena fuerte.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-700)',
                marginBottom: 6,
              }}
            >
              Contrasena actual
            </label>
            <Input
              value={currentPassword}
              onChange={(v) => {
                setCurrentPassword(v)
                setError('')
              }}
              type="password"
              prefix={<Lock size={16} />}
              ariaLabel="Contrasena actual"
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-700)',
                marginBottom: 6,
              }}
            >
              Nueva contrasena
            </label>
            <Input
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              prefix={<Lock size={16} />}
              ariaLabel="Nueva contrasena"
            />
            {newPassword.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 6,
                        flex: 1,
                        borderRadius: 999,
                        background: i <= strength.score ? strength.varName : 'var(--ink-100)',
                        transition: 'background var(--dur-fast) var(--ease-out)',
                      }}
                    />
                  ))}
                </div>
                <p style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-500)' }}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-700)',
                marginBottom: 6,
              }}
            >
              Confirmar nueva contrasena
            </label>
            <Input
              value={confirmPassword}
              onChange={setConfirmPassword}
              type="password"
              prefix={<Lock size={16} />}
              error={confirmPassword.length > 0 && !passwordsMatch ? 'Las contrasenas no coinciden' : undefined}
              ariaLabel="Confirmar nueva contrasena"
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, marginTop: 12, color: 'var(--danger-600)' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
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
          <PrimaryButton onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? 'Cambiando...' : 'Cambiar contrasena'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
