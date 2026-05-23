import { Link, useNavigate } from 'react-router-dom'
import { Frown, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import AuthShell from '../components/auth/AuthShell'

export default function ConsentRejected() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  function handleLogout() {
    logout()
    navigate('/')
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
            Respetamos tu<br />decisión.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            El consentimiento informado es necesario para utilizar Mabel IA bajo la Ley 1581/2012.
            Puedes revisarlo de nuevo cuando lo desees.
          </p>
        </div>
      }
      wide
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--ink-100)',
              color: 'var(--ink-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Frown size={28} />
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
            textAlign: 'center',
          }}
        >
          Consentimiento no aceptado
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-500)',
            margin: '0 0 22px',
            lineHeight: 1.55,
            textAlign: 'center',
          }}
        >
          De acuerdo con la Ley 1581 de 2012, el consentimiento informado es necesario para utilizar
          Mabel IA, ya que el sistema procesa datos personales como parte de un proyecto de
          investigación académica.
        </p>

        <div
          style={{
            padding: 18,
            borderRadius: 14,
            background: 'var(--mabel-50)',
            border: '1px solid var(--mabel-100)',
            marginBottom: 22,
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--mabel-800)',
              margin: '0 0 10px',
            }}
          >
            Al aceptar, puedes:
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {[
              'Acceder al asistente de apoyo psicoeducativo',
              'Recibir orientación sobre bienestar emocional',
              'Utilizar herramientas de check-in y seguimiento',
              'Revocar el consentimiento en cualquier momento',
            ].map((item, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--ink-700)',
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--mabel-600)',
                    marginTop: 7,
                    flexShrink: 0,
                  }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--shadow-brand)',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
          >
            Volver a revisar el consentimiento
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
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Cerrar sesión
          </button>
        </div>

        <p
          style={{
            marginTop: 18,
            fontSize: 11.5,
            color: 'var(--ink-400)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Si tienes preguntas, contacta al equipo de investigación a través de los canales
          institucionales de la UMB.
        </p>
      </div>
    </AuthShell>
  )
}
