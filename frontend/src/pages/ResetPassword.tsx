import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client'

function getPasswordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Debil', color: 'bg-danger', pct: 25 }
  if (score === 2) return { label: 'Regular', color: 'bg-warning', pct: 50 }
  if (score === 3) return { label: 'Buena', color: 'bg-warning', pct: 75 }
  return { label: 'Fuerte', color: 'bg-success', pct: 100 }
}

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [valid, setValid] = useState<boolean | null>(null)
  const [reason, setReason] = useState('')
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    apiClient.get(`/auth/reset-password/${token}`).then((res) => {
      setValid(res.data.valid)
      if (!res.data.valid) setReason(res.data.reason || 'invalid')
    }).catch(() => setValid(false))
  }, [token])

  const strength = getPasswordStrength(form.password)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (form.password !== form.confirm) { setError('Las contrasenas no coinciden'); return }
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: form.password })
      navigate('/login', { state: { toast: 'Contrasena actualizada' } })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cambiar contrasena')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">&#9888;</div>
          <h1 className="text-2xl font-bold text-text-primary mb-3">Enlace invalido</h1>
          <p className="text-text-primary/60 mb-6">
            {reason === 'expired' ? 'Este enlace ha expirado. Solicita uno nuevo.' : 'Este enlace no es valido.'}
          </p>
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-8 text-center">Nueva contrasena</h1>
        {error && <div className="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Nueva contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              required
            />
            {form.password && (
              <div className="mt-2">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.pct}%` }} />
                </div>
                <p className="text-xs text-text-primary/50 mt-1">{strength.label}</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Confirmar contrasena</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cambiando...' : 'Cambiar contrasena'}
          </button>
        </form>
      </div>
    </div>
  )
}
