import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const [form, setForm] = useState({ email: '', password: '', remember_me: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [successToast, setSuccessToast] = useState('')

  useEffect(() => {
    const state = location.state as { toast?: string } | null
    if (state?.toast) {
      setSuccessToast(state.toast)
      window.history.replaceState({}, '')
    }
  }, [location])

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await apiClient.post('/auth/login', form)
      login(res.data.access_token, res.data.user)
      const target = res.data.user.role === 'admin' ? '/admin' : '/home'
      navigate(target, { replace: true })
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (err.response?.status === 403 && typeof detail === 'string' && detail.startsWith('Cuenta deshabilitada'))
        setError(detail)
      else setError('Credenciales invalidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <h1 className="text-[28px] font-display italic text-[var(--text-strong)] text-center mb-2">
          Iniciar sesion
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] text-center mb-8">
          Continua tu camino con Mabel IA.
        </p>

        {successToast && (
          <div
            className="mb-4 px-3 py-2.5 text-[13px] rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--success)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {successToast}
          </div>
        )}
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
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors"
              placeholder="tu@est.umb.edu.co"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors"
              required
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="remember"
              checked={form.remember_me}
              onChange={(e) => setForm({ ...form, remember_me: e.target.checked })}
              className="w-4 h-4 rounded border-[var(--border-strong)]"
              style={{ accentColor: 'var(--accent)' }}
            />
            <label htmlFor="remember" className="text-[13px] text-[var(--text-muted)] cursor-pointer">
              Recordar sesion
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesion'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <Link to="/forgot-password" className="block text-[13px] text-[var(--accent)] hover:underline">
            Olvidaste tu contrasena?
          </Link>
          <p className="text-[13px] text-[var(--text-muted)]">
            No tienes cuenta?{' '}
            <Link to="/register" className="text-[var(--accent)] font-medium hover:underline">
              Registrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
