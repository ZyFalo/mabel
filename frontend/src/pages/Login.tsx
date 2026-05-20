import { FormEvent, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import AuthShell from '../components/auth/AuthShell'
import Input from '../components/settings/primitives/Input'

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
    <AuthShell
      side={
        <div>
          <h1
            style={{
              fontSize: 40,
              fontWeight: 700,
              margin: '0 0 14px',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Bienvenido<br />de vuelta.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            Inicia sesion para continuar tu camino de bienestar con Mabel IA.
          </p>
        </div>
      }
    >
      <div>
        <h2
          style={{
            fontSize: 26,
            fontWeight: 700,
            margin: '0 0 6px',
            letterSpacing: '-0.015em',
            color: 'var(--ink-900)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Iniciar sesion
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 24px' }}>
          Ingresa tus credenciales para continuar.
        </p>

        {successToast && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              fontSize: 13,
              borderRadius: 10,
              background: 'var(--success-50)',
              color: 'var(--success-700)',
              border: '1px solid var(--success-200)',
            }}
          >
            {successToast}
          </div>
        )}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              fontSize: 13,
              borderRadius: 10,
              background: 'var(--danger-50)',
              color: 'var(--danger-700)',
              border: '1px solid var(--danger-200)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              Correo institucional
            </label>
            <Input
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              type="email"
              placeholder="tu.nombre@est.umb.edu.co"
              prefix={<Mail size={16} />}
              ariaLabel="Correo electronico"
            />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>Contrasena</label>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: 12,
                  color: 'var(--mabel-600)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Olvidaste tu contrasena?
              </Link>
            </div>
            <Input
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              type="password"
              placeholder="Tu contrasena"
              prefix={<Lock size={16} />}
              ariaLabel="Contrasena"
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-700)',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >
            <input
              type="checkbox"
              checked={form.remember_me}
              onChange={(e) => setForm({ ...form, remember_me: e.target.checked })}
              style={{ accentColor: 'var(--mabel-600)', width: 16, height: 16 }}
            />
            Recordarme
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '13px',
              background: loading ? 'var(--mabel-700)' : 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 11,
              fontSize: 14.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--shadow-brand)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background var(--dur-fast) var(--ease-out)',
              marginTop: 8,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--mabel-700)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--mabel-600)'
            }}
          >
            {loading ? 'Ingresando...' : 'Iniciar sesion'}
            {!loading && <ArrowRight size={15} strokeWidth={2.25} />}
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            marginTop: 22,
            fontSize: 13,
            color: 'var(--ink-600)',
          }}
        >
          No tienes cuenta?{' '}
          <Link
            to="/register"
            style={{ color: 'var(--mabel-600)', fontWeight: 600, textDecoration: 'none' }}
          >
            Crear cuenta nueva
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
