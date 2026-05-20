import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import apiClient from '../api/client'

function getPasswordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Debil', varName: 'var(--danger)', pct: 25 }
  if (score === 2) return { label: 'Regular', varName: 'var(--warning)', pct: 50 }
  if (score === 3) return { label: 'Buena', varName: 'var(--warning)', pct: 75 }
  return { label: 'Fuerte', varName: 'var(--success)', pct: 100 }
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
    apiClient
      .get(`/auth/reset-password/${token}`)
      .then((res) => {
        setValid(res.data.valid)
        if (!res.data.valid) setReason(res.data.reason || 'invalid')
      })
      .catch(() => setValid(false))
  }, [token])

  const strength = getPasswordStrength(form.password)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (form.password !== form.confirm) {
      setError('Las contrasenas no coinciden')
      return
    }
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
      <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full animate-spin"
          style={{
            border: '4px solid var(--border)',
            borderTopColor: 'var(--accent)',
          }}
        />
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
        <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in text-center">
          <div className="flex justify-center mb-4">
            <AlertTriangle size={48} style={{ color: 'var(--warning)' }} />
          </div>
          <h1 className="text-[22px] font-display italic text-[var(--text-strong)] mb-3">Enlace invalido</h1>
          <p className="text-[14px] text-[var(--text-muted)] mb-6 leading-relaxed">
            {reason === 'expired' ? 'Este enlace ha expirado. Solicita uno nuevo.' : 'Este enlace no es valido.'}
          </p>
          <Link
            to="/forgot-password"
            className="inline-block px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    )
  }

  const inputClass =
    'w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors'

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <h1 className="text-[28px] font-display italic text-[var(--text-strong)] text-center mb-2">
          Nueva contrasena
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] text-center mb-8">
          Elige una contrasena fuerte para tu cuenta.
        </p>

        {error && (
          <div
            className="mb-4 px-3 py-2.5 text-[13px] rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--danger)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Nueva contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
              required
            />
            {form.password && (
              <div className="mt-2">
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-hover)' }}
                >
                  <div
                    className="h-full transition-all"
                    style={{ width: `${strength.pct}%`, backgroundColor: strength.varName }}
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Confirmar contrasena</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
          >
            {loading ? 'Cambiando...' : 'Cambiar contrasena'}
          </button>
        </form>
      </div>
    </div>
  )
}
