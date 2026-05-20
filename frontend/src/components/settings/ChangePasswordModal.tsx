import { useState } from 'react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

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
  if (score <= 1) return { score, label: 'Debil', varName: 'var(--danger)' }
  if (score <= 2) return { score, label: 'Media', varName: 'var(--warning)' }
  if (score <= 3) return { score, label: 'Buena', varName: 'var(--accent)' }
  return { score, label: 'Fuerte', varName: 'var(--success)' }
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

  const inputClass =
    'w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg max-w-md w-full p-6 scale-in">
        <h2 className="text-[18px] font-display italic text-[var(--text-strong)] mb-1">
          Cambiar contrasena
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-5">
          Asegurate de elegir una contrasena fuerte.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">
              Contrasena actual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value)
                setError('')
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">
              Nueva contrasena
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            {newPassword.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 flex-1 rounded-full"
                      style={{
                        backgroundColor: i <= strength.score ? strength.varName : 'var(--bg-hover)',
                      }}
                    />
                  ))}
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">
              Confirmar nueva contrasena
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-[12px] mt-1" style={{ color: 'var(--danger)' }}>
                Las contrasenas no coinciden
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-[13px] mt-3" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] text-[13px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="flex-1 px-5 py-2.5 bg-[var(--accent)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? 'Cambiando...' : 'Cambiar'}
          </button>
        </div>
      </div>
    </div>
  )
}
