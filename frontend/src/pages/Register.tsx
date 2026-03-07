import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../api/client'

function getPasswordStrength(pw: string): { label: string; color: string; pct: number } {
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

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-8 text-center">Crear cuenta</h1>

        {toast && (
          <div className="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{toast}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Display name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Nombre</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Tu nombre"
            />
            {errors.display_name && <p className="mt-1 text-sm text-danger">{errors.display_name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Email institucional</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="usuario@est.umb.edu.co"
            />
            {errors.email && <p className="mt-1 text-sm text-danger">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Contrasena</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Minimo 8 caracteres"
            />
            {form.password && (
              <div className="mt-2">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full ${strength.color} transition-all`} style={{ width: `${strength.pct}%` }} />
                </div>
                <p className="text-xs text-text-primary/50 mt-1">{strength.label}</p>
              </div>
            )}
            {errors.password && <p className="mt-1 text-sm text-danger">{errors.password}</p>}
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Confirmar contrasena</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Repite la contrasena"
            />
            {errors.confirm && <p className="mt-1 text-sm text-danger">{errors.confirm}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-primary/60">
          Ya tienes cuenta?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  )
}
