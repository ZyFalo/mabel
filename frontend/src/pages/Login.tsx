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
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-8 text-center">Iniciar sesion</h1>

        {successToast && (
          <div className="mb-4 p-3 bg-success/10 text-success text-sm rounded-lg">{successToast}</div>
        )}
        {error && <div className="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="tu@est.umb.edu.co"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember"
              checked={form.remember_me}
              onChange={(e) => setForm({ ...form, remember_me: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="remember" className="text-sm text-text-primary/60">Recordar sesion</label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesion'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <Link to="/forgot-password" className="block text-sm text-primary/70 hover:underline">
            Olvidaste tu contrasena?
          </Link>
          <p className="text-sm text-text-primary/60">
            No tienes cuenta?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Registrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
