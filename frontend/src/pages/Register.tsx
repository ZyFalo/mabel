import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

function getPasswordStrength(pw: string): { label: string; varName: string; pct: number } {
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

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ display_name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const strength = getPasswordStrength(form.password)

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (form.display_name.trim().length < 2) e.display_name = 'Minimo 2 caracteres'
    if (!/^[a-zA-Z0-9._%+-]+@est\.umb\.edu\.co$/.test(form.email))
      e.email = 'Debe ser un email @est.umb.edu.co'
    if (form.password.length < 8) e.password = 'Minimo 8 caracteres'
    else if (!/[A-Z]/.test(form.password)) e.password = 'Debe tener al menos 1 mayuscula'
    else if (!/[0-9]/.test(form.password)) e.password = 'Debe tener al menos 1 numero'
    else if (!/[^a-zA-Z0-9]/.test(form.password)) e.password = 'Debe tener al menos 1 caracter especial'
    if (form.password !== form.confirm) e.confirm = 'Las contrasenas no coinciden'
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
      if (err.response?.status === 409) setToast(detail || 'Este email ya esta registrado')
      else setToast(detail || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors'

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <h1 className="text-[28px] font-display italic text-[var(--text-strong)] text-center mb-2">
          Crear cuenta
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] text-center mb-8">
          Comienza tu acompanamiento con Mabel IA.
        </p>

        {toast && (
          <div
            className="mb-4 px-3 py-2.5 text-[13px] rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-hover)',
              color: 'var(--danger)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {toast}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Nombre</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className={inputClass}
              placeholder="Tu nombre"
            />
            {errors.display_name && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--danger)' }}>
                {errors.display_name}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Email institucional</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              placeholder="usuario@est.umb.edu.co"
            />
            {errors.email && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--danger)' }}>
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputClass}
              placeholder="Minimo 8 caracteres"
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
            {errors.password && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--danger)' }}>
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Confirmar contrasena</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className={inputClass}
              placeholder="Repite la contrasena"
            />
            {errors.confirm && (
              <p className="mt-1 text-[12px]" style={{ color: 'var(--danger)' }}>
                {errors.confirm}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity mt-2"
          >
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-[var(--text-muted)]">
          Ya tienes cuenta?{' '}
          <Link to="/login" className="text-[var(--accent)] font-medium hover:underline">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  )
}
