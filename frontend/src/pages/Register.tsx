import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, Mail, Lock, ArrowRight } from 'lucide-react'
import apiClient from '../api/client'
import AuthShell from '../components/auth/AuthShell'
import Input from '../components/settings/primitives/Input'

function getPasswordStrength(pw: string): { label: string; varName: string; pct: number } {
  let score = 0
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { label: 'Débil', varName: 'var(--danger-600)', pct: 25 }
  if (score === 2) return { label: 'Regular', varName: 'var(--warn-600)', pct: 50 }
  if (score === 3) return { label: 'Buena', varName: 'var(--warn-600)', pct: 75 }
  return { label: 'Fuerte', varName: 'var(--success-600)', pct: 100 }
}

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ display_name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const strength = getPasswordStrength(form.password)

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (form.display_name.trim().length < 2) e.display_name = 'Mínimo 2 caracteres'
    if (!/^[a-zA-Z0-9._%+-]+@umb\.edu\.co$/.test(form.email))
      e.email = 'Debe ser un email @umb.edu.co'
    if (form.password.length < 8) e.password = 'Mínimo 8 caracteres'
    else if (!/[A-Z]/.test(form.password)) e.password = 'Debe tener al menos 1 mayúscula'
    else if (!/[0-9]/.test(form.password)) e.password = 'Debe tener al menos 1 número'
    else if (!/[^a-zA-Z0-9]/.test(form.password)) e.password = 'Debe tener al menos 1 carácter especial'
    if (form.password !== form.confirm) e.confirm = 'Las contraseñas no coinciden'
    return e
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setLoading(true)
    try {
      await apiClient.post('/auth/register', {
        email: form.email,
        password: form.password,
        display_name: form.display_name.trim(),
      })
      navigate('/login', { state: { toast: 'Cuenta creada exitosamente' } })
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (err.response?.status === 409) setToast(detail || 'Este email ya está registrado')
      else setToast(detail || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      compactHero
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
            Empieza tu<br />camino con Mabel.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            Regístrate y comienza tu experiencia con tu compañera de apoyo psicoeducativo disponible
            24/7.
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
          Crear cuenta
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 24px' }}>
          Únete a Mabel y empieza tu camino de bienestar.
        </p>

        {toast && (
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
            {toast}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Display name */}
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
              Nombre completo
            </label>
            <Input
              value={form.display_name}
              onChange={(v) => setForm({ ...form, display_name: v })}
              type="text"
              placeholder="Ej: María González"
              prefix={<User size={16} />}
              error={errors.display_name}
              ariaLabel="Nombre completo"
            />
          </div>

          {/* Email */}
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
              placeholder="tu.nombre@umb.edu.co"
              prefix={<Mail size={16} />}
              error={errors.email}
              ariaLabel="Correo electrónico"
            />
          </div>

          {/* Password */}
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
              Contraseña
            </label>
            <Input
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              type="password"
              placeholder="Mínimo 8 caracteres"
              prefix={<Lock size={16} />}
              error={errors.password}
              ariaLabel="Contraseña"
            />
            {form.password && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'var(--ink-100)',
                  }}
                >
                  <div
                    style={{
                      width: `${strength.pct}%`,
                      height: '100%',
                      background: strength.varName,
                      transition: 'width var(--dur-base) var(--ease-out)',
                    }}
                  />
                </div>
                <p style={{ fontSize: 11, marginTop: 4, color: 'var(--ink-500)' }}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* Confirm */}
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
              Confirmar contraseña
            </label>
            <Input
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
              type="password"
              placeholder="Repite tu contraseña"
              prefix={<Lock size={16} />}
              error={errors.confirm}
              ariaLabel="Confirmar contraseña"
            />
          </div>

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
              background: 'var(--mabel-600)',
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
              marginTop: 6,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--mabel-700)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--mabel-600)'
            }}
          >
            {loading ? 'Registrando...' : 'Crear mi cuenta'}
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
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/login"
            style={{ color: 'var(--mabel-600)', fontWeight: 600, textDecoration: 'none' }}
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
