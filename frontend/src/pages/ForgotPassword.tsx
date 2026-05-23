import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react'
import apiClient from '../api/client'
import AuthShell from '../components/auth/AuthShell'
import Input from '../components/settings/primitives/Input'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    setLoading(true)
    try {
      await apiClient.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      // Mismo path success que el OK por anti-enumeracion (D-03): el
      // usuario nunca debe poder distinguir "email existe" de "email no
      // existe" desde el resultado de este endpoint.
      setSent(true)
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
            Recupera tu<br />acceso.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            Te enviaremos un enlace seguro a tu correo institucional para restablecer tu contraseña.
          </p>
        </div>
      }
    >
      <div>
        <Link to="/login" className="auth-back-link">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Volver al inicio de sesión
        </Link>
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
          Recuperar contraseña
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 18px' }}>
          Ingresa tu email institucional y te enviaremos instrucciones.
        </p>

        {/* Aviso honesto: el envio de correo aun no esta cableado a un
            proveedor SMTP. El usuario que pulsa este boton no recibira
            nada en su bandeja — la unica via para recuperar acceso es
            que el administrador resetee la clave manualmente. Lo
            mostramos siempre (no solo en el estado `sent`) para que
            nadie pierda 24h esperando un correo que no llegara. */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 14px',
            fontSize: 12.5,
            lineHeight: 1.5,
            borderRadius: 12,
            background: 'var(--warn-50)',
            color: 'var(--warn-700)',
            border: '1px solid var(--warn-200)',
            alignItems: 'flex-start',
            marginBottom: 20,
          }}
        >
          <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>Funcion en habilitacion.</strong> El envio automatico
            por correo aun no esta disponible en esta version. Si necesitas
            recuperar tu acceso, escribe al administrador del proyecto
            indicando tu correo institucional.
          </span>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '14px 16px',
                fontSize: 13,
                borderRadius: 12,
                background: 'var(--success-50)',
                color: 'var(--success-700)',
                border: '1px solid var(--success-200)',
                alignItems: 'flex-start',
              }}
            >
              <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>Si el email está registrado, recibirás instrucciones en breve.</span>
            </div>
          </div>
        ) : (
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
                value={email}
                onChange={setEmail}
                type="email"
                placeholder="tu.nombre@umb.edu.co"
                prefix={<Mail size={16} />}
                ariaLabel="Correo electrónico"
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
              {loading ? 'Enviando...' : 'Enviar enlace'}
              {!loading && <ArrowRight size={15} strokeWidth={2.25} />}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
