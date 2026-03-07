import { useState } from 'react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

interface ChangePasswordModalProps {
  open: boolean
  onClose: () => void
}

function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Debil', color: 'bg-danger' }
  if (score <= 2) return { score, label: 'Media', color: 'bg-warning' }
  if (score <= 3) return { score, label: 'Buena', color: 'bg-primary' }
  return { score, label: 'Fuerte', color: 'bg-success' }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-text-primary text-center mb-5">Cambiar contrasena</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-primary mb-1">Contrasena actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setError('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-primary mb-1">Nueva contrasena</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {newPassword.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= strength.score ? strength.color : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-text-primary/50 mt-1">{strength.label}</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-text-primary mb-1">Confirmar nueva contrasena</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-danger mt-1">Las contrasenas no coinciden</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-danger mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 text-sm font-medium rounded-lg text-text-primary hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="flex-1 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Cambiando...' : 'Cambiar'}
          </button>
        </div>
      </div>
    </div>
  )
}
