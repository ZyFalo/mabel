import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'

interface ConsentVersion {
  id: string
  version: string
  title: string
  body: string
}

export default function Consent() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [version, setVersion] = useState<ConsentVersion | null>(null)
  const [noVersion, setNoVersion] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [scope, setScope] = useState<string>('')
  const [accepted, setAccepted] = useState(false)
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.get('/consent-versions/active')
      .then((res) => setVersion(res.data))
      .catch((err) => {
        if (err.response?.status === 404) setNoVersion(true)
        else setError('Error al cargar el consentimiento')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    if (atBottom) setScrolledToEnd(true)
  }, [])

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!version || !scope || !accepted) return
    setSubmitting(true)
    setError('')

    try {
      // Check if user has a revoked consent for this version (re-acceptance)
      const statusRes = await apiClient.get('/users/me/consent-status')
      const status = statusRes.data.status

      if (status === 'revoked') {
        await apiClient.patch('/consents/current', { action: 're-accept', scope })
      } else {
        await apiClient.post('/consents', { consent_version_id: version.id, scope })
      }

      // Conditional redirect: check if preferences exist
      try {
        await apiClient.get('/preferences/me')
        navigate('/home', { replace: true })
      } catch {
        // No preferences → onboarding (Fase 5 placeholder → /home)
        navigate('/home', { replace: true })
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al aceptar el consentimiento')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (noVersion) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-text-primary mb-4">Sin version disponible</h1>
          <p className="text-text-primary/60 mb-6">
            No hay una version de consentimiento disponible. Contacta al equipo de investigacion.
          </p>
          <button
            onClick={() => { logout(); navigate('/') }}
            className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    )
  }

  const canSubmit = scrolledToEnd && accepted && scope !== ''

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-primary mb-2 text-center">Consentimiento Informado</h1>
        {version && (
          <div className="flex justify-center mb-6">
            <span className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full font-medium">
              Version {version.version}
            </span>
          </div>
        )}

        {error && <div className="mb-4 p-3 bg-danger/10 text-danger text-sm rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Legal text */}
          <div className="relative mb-6">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-80 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm text-text-primary/80 leading-relaxed whitespace-pre-wrap"
            >
              {version?.body}
            </div>
            {!scrolledToEnd && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-50 to-transparent rounded-b-lg flex items-end justify-center pb-1">
                <span className="text-xs text-primary animate-bounce">Desplaza para leer todo el texto</span>
              </div>
            )}
          </div>

          {/* Scope */}
          <div className="mb-6">
            <p className="text-sm font-medium text-text-primary mb-3">Alcance del consentimiento:</p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-primary/30">
                <input
                  type="radio"
                  name="scope"
                  value="solo_uso"
                  checked={scope === 'solo_uso'}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <span className="font-medium text-sm">Solo uso</span>
                  <p className="text-xs text-text-primary/50">Datos minimos para el funcionamiento del sistema.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-primary/30">
                <input
                  type="radio"
                  name="scope"
                  value="uso_mejora_anon"
                  checked={scope === 'uso_mejora_anon'}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <span className="font-medium text-sm">Uso + mejora anonima</span>
                  <p className="text-xs text-text-primary/50">Datos anonimizados para mejorar el servicio.</p>
                </div>
              </label>
            </div>
          </div>

          {/* Checkbox */}
          <div className="mb-6">
            <label className={`flex items-center gap-3 ${!scrolledToEnd ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={!scrolledToEnd}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-text-primary">He leido y acepto el consentimiento informado</span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="flex-1 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Aceptando...' : 'Aceptar y continuar'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/consent/rejected')}
              className="px-6 py-3 border-2 border-gray-300 text-text-primary/70 rounded-lg font-medium hover:border-gray-400 transition-colors"
            >
              Rechazar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
