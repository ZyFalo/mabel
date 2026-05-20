import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../api/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetLink, setResetLink] = useState('')

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    setLoading(true)
    try {
      const res = await apiClient.post('/auth/forgot-password', { email })
      setSent(true)
      if (res.data.reset_link) setResetLink(res.data.reset_link)
    } catch {
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <h1 className="text-[28px] font-display italic text-[var(--text-strong)] text-center mb-2">
          Recuperar contrasena
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] text-center mb-8">
          Ingresa tu email y te enviaremos instrucciones.
        </p>

        {sent ? (
          <div className="space-y-4">
            <div
              className="p-4 text-[13px] rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-hover)',
                color: 'var(--success)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              Si el email esta registrado, recibiras instrucciones.
            </div>
            {resetLink && (
              <div
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-hover)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <p className="text-[13px] font-medium text-[var(--text-strong)] mb-2">Enlace simulado (MVP):</p>
                <Link
                  to={resetLink}
                  className="text-[12px] text-[var(--accent)] break-all hover:underline"
                >
                  {window.location.origin}
                  {resetLink}
                </Link>
              </div>
            )}
            <Link
              to="/login"
              className="block text-center text-[13px] text-[var(--accent)] hover:underline"
            >
              Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text)] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--accent)] focus:outline-none transition-colors"
                placeholder="tu@est.umb.edu.co"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
            <Link
              to="/login"
              className="block text-center text-[13px] text-[var(--accent)] hover:underline pt-2"
            >
              Volver al login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
