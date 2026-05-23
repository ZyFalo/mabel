import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Hand, Lock, ArrowRight } from 'lucide-react'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import AuthShell from '../components/auth/AuthShell'

interface StatusData {
  status: string
  current_version?: string
  new_version?: string
}

export default function ConsentRequired() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient
      .get('/users/me/consent-status')
      .then((res) => {
        if (res.data.status === 'ok') navigate('/home', { replace: true })
        else setData(res.data)
      })
      .catch(() => setData({ status: 'no_consent' }))
      .finally(() => setLoading(false))
  }, [navigate])

  function handleLogout() {
    logout()
    navigate('/')
  }

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

  // Hero copy varies per status
  const heroByStatus: Record<string, { title: string; subtitle: string }> = {
    no_consent: {
      title: 'Antes de empezar,\nun paso importante.',
      subtitle:
        'Para continuar necesitas revisar y aceptar el consentimiento informado según la Ley 1581/2012.',
    },
    revoked: {
      title: 'Consentimiento\nrevocado.',
      subtitle:
        'Tu acceso está temporalmente bloqueado. Puedes re-aceptar el consentimiento cuando quieras.',
    },
    new_version_required: {
      title: 'Hay una nueva\nversión.',
      subtitle:
        'Hemos actualizado el consentimiento informado. Revísalo para continuar usando Mabel.',
    },
  }
  const hero =
    heroByStatus[data?.status || 'no_consent'] || heroByStatus.no_consent

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
              whiteSpace: 'pre-line',
            }}
          >
            {hero.title}
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            {hero.subtitle}
          </p>
        </div>
      }
      wide
    >
      <div style={{ textAlign: 'center' }}>
        {/* Variant A — No consent */}
        {data?.status === 'no_consent' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'var(--mabel-50)',
                  color: 'var(--mabel-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Hand size={28} />
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
              Bienvenido a Mabel IA
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-500)',
                margin: '0 0 22px',
                lineHeight: 1.55,
              }}
            >
              Para continuar, necesitas revisar y aceptar el consentimiento informado.
            </p>
            <Link
              to="/consent"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 22px',
                background: 'var(--mabel-600)',
                color: '#fff',
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: 'var(--shadow-brand)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Ir al consentimiento
              <ArrowRight size={15} strokeWidth={2.25} />
            </Link>
          </>
        )}

        {/* Variant B — Revoked */}
        {data?.status === 'revoked' && (
          <>
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
                <Lock size={28} />
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
              Consentimiento revocado
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-500)',
                margin: '0 0 10px',
                lineHeight: 1.55,
              }}
            >
              Tu consentimiento ha sido revocado y el acceso está temporalmente bloqueado.
            </p>
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-500)',
                margin: '0 0 22px',
                lineHeight: 1.55,
              }}
            >
              Puedes re-aceptar el consentimiento en cualquier momento para recuperar el acceso.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                maxWidth: 360,
                margin: '0 auto',
              }}
            >
              <Link
                to="/consent"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '13px',
                  background: 'var(--mabel-600)',
                  color: '#fff',
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-brand)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Re-aceptar consentimiento
                <ArrowRight size={15} strokeWidth={2.25} />
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'transparent',
                  color: 'var(--ink-600)',
                  border: '1px solid var(--ink-300)',
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}

        {/* Variant C — New version required */}
        {data?.status === 'new_version_required' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'var(--info-50)',
                  color: 'var(--info-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={28} />
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
              Nueva versión del consentimiento
            </h2>
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-500)',
                margin: '0 0 10px',
                lineHeight: 1.55,
              }}
            >
              Hay una nueva versión del consentimiento informado que debes aceptar para continuar.
            </p>
            {data.new_version && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--ink-500)',
                  margin: '0 0 22px',
                }}
              >
                Nueva versión:{' '}
                <span style={{ fontWeight: 600, color: 'var(--mabel-600)' }}>{data.new_version}</span>
              </p>
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                maxWidth: 360,
                margin: '0 auto',
              }}
            >
              <Link
                to="/consent"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '13px',
                  background: 'var(--mabel-600)',
                  color: '#fff',
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-brand)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Revisar nueva versión
                <ArrowRight size={15} strokeWidth={2.25} />
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: 'transparent',
                  color: 'var(--ink-600)',
                  border: '1px solid var(--ink-300)',
                  borderRadius: 11,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  )
}
