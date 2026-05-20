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
    apiClient
      .get('/consent-versions/active')
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
      <div className="min-h-screen w-full bg-[var(--ink-50)] flex items-center justify-center">
        <div
          className="w-8 h-8 rounded-full animate-spin"
          style={{
            border: '4px solid var(--ink-200)',
            borderTopColor: 'var(--mabel-600)',
          }}
        />
      </div>
    )
  }

  if (noVersion) {
    return (
      <div className="min-h-screen w-full bg-[var(--ink-50)] flex items-center justify-center px-4 py-12 fade-in">
        <div className="w-full max-w-md bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in text-center">
          <h1 className="text-[22px] font-display italic text-[var(--ink-900)] mb-3">
            Sin version disponible
          </h1>
          <p className="text-[14px] text-[var(--ink-500)] mb-6 leading-relaxed">
            No hay una version de consentimiento disponible. Contacta al equipo de investigacion.
          </p>
          <button
            onClick={() => {
              logout()
              navigate('/')
            }}
            className="inline-block px-5 py-2.5 bg-[var(--mabel-600)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Cerrar sesion
          </button>
        </div>
      </div>
    )
  }

  const canSubmit = scrolledToEnd && accepted && scope !== ''

  return (
    <div className="min-h-screen w-full bg-[var(--ink-50)] flex items-start justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-2xl bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <h1 className="text-[28px] font-display italic text-[var(--ink-900)] text-center mb-2">
          Consentimiento Informado
        </h1>
        {version && (
          <div className="flex justify-center mb-8">
            <span
              className="px-3 py-1 text-[12px] rounded-full font-medium"
              style={{
                backgroundColor: 'var(--ink-100)',
                color: 'var(--mabel-600)',
              }}
            >
              Version {version.version}
            </span>
          </div>
        )}

        {error && (
          <div
            className="mb-4 px-3 py-2.5 text-[13px] rounded-lg border"
            style={{
              backgroundColor: 'var(--ink-100)',
              color: 'var(--danger-600)',
              borderColor: 'var(--ink-100)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Legal text */}
          <div className="relative mb-6">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-80 overflow-y-auto rounded-lg p-4 text-[13px] leading-relaxed whitespace-pre-wrap border"
              style={{
                backgroundColor: 'var(--ink-50)',
                color: 'var(--ink-700)',
                borderColor: 'var(--ink-200)',
              }}
            >
              {version?.body}
            </div>
            {!scrolledToEnd && (
              <div
                className="absolute bottom-0 left-0 right-0 h-12 rounded-b-lg flex items-end justify-center pb-1.5 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(to top, var(--ink-50) 0%, var(--ink-50) 30%, transparent 100%)',
                }}
              >
                <span className="text-[11px] animate-bounce" style={{ color: 'var(--mabel-600)' }}>
                  Desplaza para leer todo el texto
                </span>
              </div>
            )}
          </div>

          {/* Scope */}
          <div className="mb-6">
            <p className="text-[13px] font-medium text-[var(--ink-900)] mb-3">
              Alcance del consentimiento:
            </p>
            <div className="space-y-3">
              <label
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors hover:bg-[var(--ink-100)]"
                style={{ borderColor: scope === 'solo_uso' ? 'var(--mabel-600)' : 'var(--ink-200)' }}
              >
                <input
                  type="radio"
                  name="scope"
                  value="solo_uso"
                  checked={scope === 'solo_uso'}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-0.5"
                  style={{ accentColor: 'var(--mabel-600)' }}
                />
                <div>
                  <span className="font-medium text-[13px] text-[var(--ink-900)]">Solo uso</span>
                  <p className="text-[12px] text-[var(--ink-500)] mt-0.5">
                    Datos minimos para el funcionamiento del sistema.
                  </p>
                </div>
              </label>
              <label
                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors hover:bg-[var(--ink-100)]"
                style={{
                  borderColor: scope === 'uso_mejora_anon' ? 'var(--mabel-600)' : 'var(--ink-200)',
                }}
              >
                <input
                  type="radio"
                  name="scope"
                  value="uso_mejora_anon"
                  checked={scope === 'uso_mejora_anon'}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-0.5"
                  style={{ accentColor: 'var(--mabel-600)' }}
                />
                <div>
                  <span className="font-medium text-[13px] text-[var(--ink-900)]">
                    Uso + mejora anonima
                  </span>
                  <p className="text-[12px] text-[var(--ink-500)] mt-0.5">
                    Datos anonimizados para mejorar el servicio.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Checkbox */}
          <div className="mb-6">
            <label
              className={`flex items-center gap-3 ${
                !scrolledToEnd ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={!scrolledToEnd}
                className="w-4 h-4"
                style={{ accentColor: 'var(--mabel-600)' }}
              />
              <span className="text-[13px] text-[var(--ink-700)]">
                He leido y acepto el consentimiento informado
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="flex-1 px-5 py-2.5 bg-[var(--mabel-600)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? 'Aceptando...' : 'Acepto'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/consent/rejected')}
              className="px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] rounded-lg font-medium hover:bg-[var(--ink-100)] transition-colors"
            >
              Rechazo
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
