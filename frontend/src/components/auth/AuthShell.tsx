import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

interface AuthShellProps {
  /** Hero copy rendered in the middle of the left gradient panel. */
  side: ReactNode
  /** Form / content rendered on the right white panel. */
  children: ReactNode
  /** When true, RIGHT panel uses max-w 640 (for legal text / onboarding). Defaults to 420. */
  wide?: boolean
}

/**
 * AuthShell — split panel auth wrapper.
 *
 * LEFT (desktop only, hidden <md): gradient mabel-700 → 600 → 800 with decorative circles,
 * brand row top, hero `side` centered, lock disclaimer bottom.
 *
 * RIGHT: white background, form content centered, `wide` switches max-width 420 → 640.
 *
 * Mobile: left panel collapses to a top header strip with brand mark.
 */
export default function AuthShell({ side, children, wide = false }: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* LEFT panel (>= md) */}
      <div
        className="hidden md:flex"
        style={{
          flex: 1,
          padding: '48px 56px',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background:
            'linear-gradient(160deg, var(--mabel-700) 0%, var(--mabel-600) 60%, var(--mabel-800) 100%)',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -180,
            right: -200,
            width: 480,
            height: 480,
            borderRadius: 999,
            background:
              'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -160,
            left: -160,
            width: 380,
            height: 380,
            borderRadius: 999,
            background:
              'radial-gradient(circle, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 70%)',
          }}
        />

        {/* TOP brand row */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#fff',
              color: 'var(--mabel-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 20,
              fontFamily: 'var(--font-sans)',
            }}
          >
            M
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Mabel IA</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 1 }}>
              Universidad Manuela Beltran
            </div>
          </div>
        </div>

        {/* CENTER hero */}
        <div style={{ position: 'relative' }}>{side}</div>

        {/* BOTTOM disclaimer */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
            opacity: 0.7,
          }}
        >
          <Lock size={13} />
          <span>Tus conversaciones son cifradas y confidenciales.</span>
        </div>
      </div>

      {/* MOBILE top header (< md) */}
      <div
        className="md:hidden"
        style={{
          padding: '20px 24px',
          background:
            'linear-gradient(160deg, var(--mabel-700) 0%, var(--mabel-600) 60%, var(--mabel-800) 100%)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#fff',
            color: 'var(--mabel-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'var(--font-sans)',
          }}
        >
          M
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Mabel IA</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>UMB</div>
        </div>
      </div>

      {/* RIGHT panel — formulario */}
      <div
        className="flex-1 fade-in"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          paddingTop: 'max(48px, env(safe-area-inset-top))',
          background: '#fff',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: wide ? 640 : 420,
            // Add top spacing on mobile so the fixed top header doesn't overlap content
            marginTop: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
