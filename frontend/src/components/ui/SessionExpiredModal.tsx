import { Clock, ArrowRight } from 'lucide-react'

interface SessionExpiredModalProps {
  open: boolean
  onLogin: () => void
}

export default function SessionExpiredModal({ open, onLogin }: SessionExpiredModalProps) {
  if (!open) return null

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(26,17,16,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="scale-in"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          width: 'min(100%, 440px)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '28px 26px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
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
            <Clock size={26} />
          </div>
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 8px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          Sesion expirada
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--ink-500)',
            margin: '0 0 22px',
            lineHeight: 1.6,
          }}
        >
          Tu sesion ha expirado. Por favor, inicia sesion nuevamente.
        </p>
        <button
          onClick={onLogin}
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
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            boxShadow: 'var(--shadow-brand)',
            transition: 'background var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
        >
          Ir al login
          <ArrowRight size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
