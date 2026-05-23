import { Link } from 'react-router-dom'
import { Heart, ArrowRight } from 'lucide-react'
import AuthShell from '../components/auth/AuthShell'

export default function Landing() {
  return (
    <AuthShell
      compactHero
      side={
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
            <Heart size={13} />
            Bienestar emocional UMB
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1.15,
              margin: '0 0 14px',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Un espacio seguro para hablar de ti.
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              opacity: 0.85,
              margin: 0,
              maxWidth: 380,
            }}
          >
            Mabel es tu asistente de bienestar en la Universidad Manuela Beltran. Confidencial,
            empatica, disponible siempre que la necesites.
          </p>
        </div>
      }
    >
      <div>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            margin: '0 0 6px',
            letterSpacing: '-0.015em',
            color: 'var(--ink-900)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Hola, bienvenido/a
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-500)',
            margin: '0 0 28px',
            lineHeight: 1.55,
          }}
        >
          Tu acompanamiento psicoeducativo empieza aqui. Elige como continuar.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            to="/login"
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
              fontSize: 14.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--shadow-brand)',
              textDecoration: 'none',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
          >
            Iniciar sesion
            <ArrowRight size={15} strokeWidth={2.25} />
          </Link>
          <Link
            to="/register"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '13px',
              background: 'transparent',
              color: 'var(--mabel-600)',
              border: '1px solid var(--mabel-600)',
              borderRadius: 11,
              fontSize: 14.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              textDecoration: 'none',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-50)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Registrarme
          </Link>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 22,
            borderTop: '1px solid var(--ink-100)',
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--ink-400)',
              marginBottom: 12,
              fontWeight: 600,
            }}
          >
            Como funciona
          </p>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { title: 'Registrate', desc: 'Crea tu cuenta con tu email institucional UMB.' },
              { title: 'Acepta el consentimiento', desc: 'Revisa y acepta el consentimiento informado.' },
              { title: 'Conversa con Mabel', desc: 'Inicia una conversacion de apoyo psicoeducativo.' },
            ].map((step, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: 'var(--mabel-50)',
                    color: 'var(--mabel-700)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>{step.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.55 }}>{step.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 11,
            color: 'var(--ink-400)',
            textAlign: 'center',
          }}
        >
          Proyecto de tesis - Ingenieria de Software, UMB, Bogota, 2026.
        </p>
      </div>
    </AuthShell>
  )
}
