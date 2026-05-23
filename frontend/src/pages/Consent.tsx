import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Shield, Check, RotateCcw, FileText } from 'lucide-react'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import AuthShell from '../components/auth/AuthShell'
import InfoHint from '../components/admin/InfoHint'

interface ConsentVersion {
  id: string
  version: string
  title: string
  body: string
}

// Backend `/users/me/consent-status` returns one of these per
// `ConsentService.get_consent_status` in backend/app/services/consent_service.py.
// We only treat `new_version_required` specially here; the rest collapses to
// the "first-time / re-acceptance" copy because semantically the user is
// agreeing to the SAME document for the first time (no prior acceptance to
// contrast against).
type ConsentStatusValue =
  | 'ok'
  | 'no_consent'
  | 'revoked'
  | 'new_version_required'

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
  // Drives the copy contextual ("Hemos actualizado nuestras políticas..."
  // vs the default first-acceptance copy). Loaded in parallel with the
  // active version so the page renders the right framing on first paint.
  const [consentStatus, setConsentStatus] = useState<ConsentStatusValue | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Two parallel calls: the active version body + the user's current
    // consent status. We don't await one to start the other — both are
    // independent reads and shaving a round-trip matters here because
    // this is the first thing a returning user sees on login.
    Promise.allSettled([
      apiClient.get('/consent-versions/active'),
      apiClient.get('/users/me/consent-status'),
    ]).then(([versionRes, statusRes]) => {
      if (versionRes.status === 'fulfilled') {
        setVersion(versionRes.value.data)
      } else {
        const err = versionRes.reason as { response?: { status?: number } }
        if (err.response?.status === 404) setNoVersion(true)
        else setError('Error al cargar el consentimiento')
      }
      if (statusRes.status === 'fulfilled') {
        setConsentStatus(statusRes.value.data?.status ?? null)
      }
      // If consent-status failed (auth issue, transient 5xx) we keep
      // `consentStatus = null` which falls back to the default copy —
      // safer than guessing.
      setLoading(false)
    })
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    if (atBottom) setScrolledToEnd(true)
  }, [])

  // Auto-pass the scroll gate when the text actually fits in the box.
  // Without this, `scrolledToEnd` would stay `false` forever for a short
  // consent body and the user could never enable the accept button.
  // We recompute on:
  //   - body change (`version?.body`)
  //   - container resize (ResizeObserver on scrollRef)
  // because between render and layout the dimensions can briefly be 0.
  //
  // Deliberate behavior per PO: if the text fits without scroll, the
  // gate is auto-satisfied. The Consentimiento v1.0 body in the seed
  // ALWAYS overflows the 320px box at typical viewport widths (~30-50
  // wrapped lines × 21px), so this branch is dormant in practice. If
  // a future short consent (e.g. a "cookies update" v2.x) is ever
  // published and the PO wants to FORCE scroll-to-end attestation even
  // for short texts, the right move is to add a `require_scroll`
  // boolean on `consent_versions` and gate this auto-pass on it —
  // don't unconditionally remove the auto-pass (that would silently
  // brick the accept button for legitimately short documents).
  useEffect(() => {
    if (!version?.body) return
    const el = scrollRef.current
    if (!el) return

    function checkFits() {
      const node = scrollRef.current
      if (!node) return
      // `<=` (not `<`): when the body exactly fills the box, there's
      // nothing to scroll to, so the gate should also pass.
      if (node.scrollHeight <= node.clientHeight) {
        setScrolledToEnd(true)
      }
    }

    checkFits()
    const ro = new ResizeObserver(checkFits)
    ro.observe(el)
    return () => ro.disconnect()
  }, [version?.body])

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

  // Two copy variants. `new_version_required` is the post-publication flow:
  // the user already accepted some prior consent_version, the admin published
  // a new one, and on next login they land here to re-accept. Framing it as
  // "Hemos actualizado nuestras políticas" instead of "Consentimiento
  // informado" tells them the document changed (not a new agreement they
  // never saw) and reduces drop-off vs. a generic re-presentation.
  const isUpdate = consentStatus === 'new_version_required'

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
        {isUpdate ? 'Actualización de políticas' : 'Ley 1581 de 2012'}
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
        {isUpdate ? (
          <>
            Hemos actualizado<br />nuestras políticas.
          </>
        ) : (
          <>
            Consentimiento<br />informado.
          </>
        )}
      </h1>
      <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
        {isUpdate
          ? 'Hemos actualizado el consentimiento que aceptaste antes. Revisa los cambios y acéptalos para seguir usando Mabel.'
          : 'Antes de comenzar, es importante que conozcas cómo tratamos tu información. Lee con calma y toma una decisión informada.'}
      </p>

      {/* Trust chips. Three concrete promises the user can verify on the
          right-hand panel (versioned, ARCO rights, scope explicit). Keeps
          the left column from feeling empty on wide desktops while
          reinforcing the legal posture of the page. */}
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 400,
        }}
      >
        {[
          { Icon: FileText, label: 'Documento versionado y auditable' },
          { Icon: RotateCcw, label: 'Puedes revocar tu consentimiento cuando quieras' },
          { Icon: Check, label: 'Tú decides el alcance: solo uso o mejora anónima' },
        ].map(({ Icon, label }) => (
          <div
            key={label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              opacity: 0.92,
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.14)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={12} strokeWidth={2.25} />
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>
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
      <AuthShell side={sideHero} wide compactHero>
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
            Sin versión disponible
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-500)',
              margin: '0 0 22px',
              lineHeight: 1.55,
            }}
          >
            No hay una versión de consentimiento disponible. Contacta al equipo de investigación.
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
            Cerrar sesión
          </button>
        </div>
      </AuthShell>
    )
  }

  const canSubmit = scrolledToEnd && accepted && scope !== ''

  return (
    <AuthShell side={sideHero} wide compactHero>
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
            {/*
              Show the admin-defined `version.title` (from BD) as the
              page H2 so the user sees the actual document they're
              about to accept (e.g. "Consentimiento Informado v2.0 —
              Mabel IA"). The contextual "you're seeing this because
              we updated the policies" framing lives in the side hero
              (panel rojo) and in the subtitle below. Fallback to a
              generic label when version hasn't loaded yet — keeps the
              skeleton from flashing.
            */}
            {version?.title ??
              (isUpdate
                ? 'Hemos actualizado nuestras políticas de privacidad'
                : 'Consentimiento Informado')}
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
          {isUpdate
            ? 'Para seguir usando Mabel necesitamos que aceptes la nueva versión. Lee el documento completo antes de continuar.'
            : 'Lee con atención el documento. Debes desplazarte hasta el final antes de aceptar.'}
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
          {/* Legal text. Two-layer wrapper so the native scrollbar lives
              INSIDE the rounded clip:
                - outer  : border + radius + overflow:hidden (clipping mask)
                - inner  : the actual scroll container (no radius, no border)
              Before this split, the scrollbar ran past the top-right
              border-radius and visually "poked out" of the box. */}
          <div style={{ position: 'relative', marginBottom: 22 }}>
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--ink-200)',
                overflow: 'hidden',
                background: 'var(--ink-50)',
              }}
            >
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                  height: 320,
                  overflowY: 'auto',
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--ink-700)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {version?.body}
              </div>
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
                  // Short copy under the title — what's visible always.
                  desc: 'Tus datos solo se usan para que Mabel funcione contigo. Nada se incluye en análisis del estudio ni en métricas agregadas.',
                  // Long copy revealed by the (i) tooltip — full transparency.
                  hint:
                    'Elegir "Solo uso" significa: tus mensajes, check-ins y respuestas a encuestas NO entran al panel del admin de métricas, NO se exportan a CSV de investigación, NO aparecen en la cola de calificación de empatía. Sí se procesan en runtime para responderte (eso es lo que da vida al chat) y sí quedan en los logs de seguridad y auditoría (requeridos por ley). Puedes cambiar a "Uso + mejora anónima" más adelante desde Ajustes.',
                },
                {
                  value: 'uso_mejora_anon',
                  title: 'Uso + mejora anónima',
                  desc: 'Además de hacer funcionar a Mabel, autorizas que tus datos anonimizados nutran las métricas del estudio y la mejora del servicio.',
                  hint:
                    'Elegir "Uso + mejora anónima" añade tus datos (cifrados y sin identificarte por nombre/correo) al análisis de la investigación: métricas agregadas de uso, evolución de bienestar pre/post, calificación de la calidad empática de las respuestas y exportes CSV para la tesis. Tu nombre y correo nunca aparecen en estos análisis — los identificadores se enmascaran con un hash de 16 caracteres. Puedes revocar este permiso en cualquier momento desde Ajustes.',
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
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            color: on ? 'var(--mabel-700)' : 'var(--ink-900)',
                          }}
                        >
                          {opt.title}
                        </span>
                        <InfoHint text={opt.hint} />
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
              He leído y acepto el consentimiento informado
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
