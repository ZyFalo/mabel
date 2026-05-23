import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Lock, ArrowRight } from 'lucide-react'
import apiClient from '../api/client'
import AuthShell from '../components/auth/AuthShell'
import Input from '../components/settings/primitives/Input'

function getPasswordStrength(pw: string) {
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
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: form.password })
      navigate('/login', { state: { toast: 'Contraseña actualizada' } })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cambiar contraseña')
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '4px solid var(--ink-200)',
            borderTopColor: 'var(--mabel-600)',
          }}
        />
      </div>
    )
  }

  if (!valid) {
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
              Enlace no válido.
            </h1>
            <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
              Solicita un nuevo enlace y te enviaremos las instrucciones a tu correo.
            </p>
          </div>
        }
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--warn-50)',
                color: 'var(--warn-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={26} />
            </div>
          </div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: '0 0 10px',
              color: 'var(--ink-900)',
              fontFamily: 'var(--font-sans)',
              letterSpacing: '-0.015em',
            }}
          >
            Enlace inválido
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-500)',
              margin: '0 0 22px',
              lineHeight: 1.55,
            }}
          >
            {reason === 'expired'
              ? 'Este enlace ha expirado. Solicita uno nuevo.'
              : 'Este enlace no es válido o ya fue utilizado.'}
          </p>
          <Link
            to="/forgot-password"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px 22px',
              background: 'var(--mabel-600)',
              color: '#fff',
              borderRadius: 11,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: 'var(--shadow-brand)',
            }}
          >
            Solicitar nuevo enlace
          </Link>
        </div>
      </AuthShell>
    )
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
            Crea una nueva<br />contraseña.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            Elige una contraseña fuerte para mantener tu cuenta segura.
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
          Nueva contraseña
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 24px' }}>
          Elige una contraseña fuerte para tu cuenta.
        </p>

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
              Nueva contraseña
            </label>
            <Input
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              type="password"
              placeholder="Mínimo 8 caracteres"
              prefix={<Lock size={16} />}
              ariaLabel="Nueva contraseña"
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
              placeholder="Repite la nueva contraseña"
              prefix={<Lock size={16} />}
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
            {loading ? 'Cambiando...' : 'Cambiar contraseña'}
            {!loading && <ArrowRight size={15} strokeWidth={2.25} />}
          </button>
        </form>
      </div>
    </AuthShell>
  )
}
