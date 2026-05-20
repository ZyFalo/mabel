import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Shield, Check } from 'lucide-react'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import AuthShell from '../components/auth/AuthShell'

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
        navigate('/home', { replace: true })
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al aceptar el consentimiento')
    } finally {
      setSubmitting(false)
    }
  }

  const sideHero = (
    <div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.12)',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 24,
          backdropFilter: 'blur(6px)',
        }}
      >
        <Shield size={13} />
        Ley 1581 de 2012
      </div>
      <h1
        style={{
          fontSize: 36,
          fontWeight: 700,
          margin: '0 0 14px',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Consentimiento<br />informado.
      </h1>
      <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
        Antes de comenzar, es importante que conozcas como tratamos tu informacion. Lee con calma y
        toma una decision informada.
      </p>
    </div>
  )

  if (loading) {
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

  if (noVersion) {
    return (
      <AuthShell side={sideHero} wide>
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
              <Lock size={26} />
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
            Sin version disponible
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-500)',
              margin: '0 0 22px',
              lineHeight: 1.55,
            }}
          >
            No hay una version de consentimiento disponible. Contacta al equipo de investigacion.
          </p>
          <button
            onClick={() => {
              logout()
              navigate('/')
            }}
            style={{
              padding: '12px 22px',
              background: 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 11,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-brand)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Cerrar sesion
          </button>
        </div>
      </AuthShell>
    )
  }

  const canSubmit = scrolledToEnd && accepted && scope !== ''

  return (
    <AuthShell side={sideHero} wide>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              letterSpacing: '-0.015em',
              color: 'var(--ink-900)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Consentimiento Informado
          </h2>
          {version && (
            <span
              style={{
                padding: '4px 12px',
                fontSize: 12,
                borderRadius: 999,
                fontWeight: 600,
                background: 'var(--mabel-50)',
                color: 'var(--mabel-700)',
                border: '1px solid var(--mabel-100)',
              }}
            >
              v{version.version}
            </span>
          )}
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--ink-500)', margin: '0 0 20px', lineHeight: 1.55 }}>
          Lee con atencion el documento. Debes desplazarte hasta el final antes de aceptar.
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

        <form onSubmit={handleSubmit}>
          {/* Legal text */}
          <div style={{ position: 'relative', marginBottom: 22 }}>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{
                height: 320,
                overflowY: 'auto',
                padding: 16,
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: 'var(--ink-50)',
                border: '1px solid var(--ink-200)',
                color: 'var(--ink-700)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {version?.body}
            </div>
            {!scrolledToEnd && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 56,
                  borderRadius: '0 0 12px 12px',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: 8,
                  pointerEvents: 'none',
                  background:
                    'linear-gradient(to top, var(--ink-50) 0%, var(--ink-50) 30%, transparent 100%)',
                }}
              >
                <span
                  className="animate-bounce"
                  style={{
                    fontSize: 11,
                    color: 'var(--mabel-600)',
                    fontWeight: 600,
                  }}
                >
                  Desplaza para leer todo el texto
                </span>
              </div>
            )}
          </div>

          {/* Scope */}
          <div style={{ marginBottom: 20 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ink-900)',
                margin: '0 0 12px',
              }}
            >
              Alcance del consentimiento
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  value: 'solo_uso',
                  title: 'Solo uso',
                  desc: 'Datos minimos para el funcionamiento del sistema.',
                },
                {
                  value: 'uso_mejora_anon',
                  title: 'Uso + mejora anonima',
                  desc: 'Datos anonimizados para mejorar el servicio.',
                },
              ].map((opt) => {
                const on = scope === opt.value
                return (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: 14,
                      borderRadius: 12,
                      cursor: 'pointer',
                      background: on ? 'var(--mabel-50)' : '#fff',
                      border: `1px solid ${on ? 'var(--mabel-500)' : 'var(--ink-200)'}`,
                      transition: 'all var(--dur-fast) var(--ease-out)',
                    }}
                  >
                    <input
                      type="radio"
                      name="scope"
                      value={opt.value}
                      checked={on}
                      onChange={(e) => setScope(e.target.value)}
                      style={{ accentColor: 'var(--mabel-600)', marginTop: 2 }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: on ? 'var(--mabel-700)' : 'var(--ink-900)',
                        }}
                      >
                        {opt.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 3, lineHeight: 1.5 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'var(--ink-50)',
              border: '1px solid var(--ink-200)',
              marginBottom: 20,
              cursor: scrolledToEnd ? 'pointer' : 'not-allowed',
              opacity: scrolledToEnd ? 1 : 0.55,
            }}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={!scrolledToEnd}
              style={{ accentColor: 'var(--mabel-600)', width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-700)' }}>
              He leido y acepto el consentimiento informado
            </span>
          </label>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)', marginRight: 'auto' }}>
              {canSubmit ? 'Listo para continuar' : 'Completa todos los campos para continuar'}
            </span>
            <button
              type="button"
              onClick={() => navigate('/consent/rejected')}
              style={{
                padding: '11px 18px',
                background: 'transparent',
                color: 'var(--ink-600)',
                border: 'none',
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Rechazo
            </button>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '11px 22px',
                background: canSubmit && !submitting ? 'var(--mabel-600)' : 'var(--ink-200)',
                color: '#fff',
                border: 'none',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)',
                boxShadow: canSubmit ? 'var(--shadow-brand)' : 'none',
                transition: 'background var(--dur-fast) var(--ease-out)',
              }}
            >
              <Check size={15} strokeWidth={2.5} />
              {submitting ? 'Aceptando...' : 'Acepto y continuar'}
            </button>
          </div>
        </form>
      </div>
    </AuthShell>
  )
}
