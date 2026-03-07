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
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-primary mb-4 text-center">Recuperar contrasena</h1>
        <p className="text-sm text-text-primary/60 text-center mb-8">
          Ingresa tu email y te enviaremos instrucciones
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="p-4 bg-success/10 text-success text-sm rounded-lg">
              Si el email esta registrado, recibiras instrucciones.
            </div>
            {resetLink && (
              <div className="p-4 bg-warning/10 rounded-lg">
                <p className="text-sm font-medium text-text-primary mb-2">Enlace simulado (MVP):</p>
                <Link to={resetLink} className="text-sm text-primary break-all hover:underline">
                  {window.location.origin}{resetLink}
                </Link>
              </div>
            )}
            <Link to="/login" className="block text-center text-sm text-primary hover:underline">
              Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                placeholder="tu@est.umb.edu.co"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </button>
            <Link to="/login" className="block text-center text-sm text-primary/70 hover:underline">
              Volver al login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
