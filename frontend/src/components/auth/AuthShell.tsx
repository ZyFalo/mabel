import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import UmbAvatar from '../ui/UmbAvatar'

interface AuthShellProps {
  /** Hero copy rendered in the middle of the left gradient panel. */
  side: ReactNode
  /** Form / content rendered on the right white panel. */
  children: ReactNode
  /** When true, RIGHT panel uses max-w 640 (for legal text / onboarding). Defaults to 420. */
  wide?: boolean
  /**
   * When true, the LEFT gradient panel takes ~42% of the viewport instead of
   * splitting 50/50. Used for pages with a content-heavy right column (e.g.
   * the consent document) where leaving half the screen as decorative
   * gradient looks empty on wide desktops.
   */
  compactHero?: boolean
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
export default function AuthShell({
  side,
  children,
  wide = false,
  compactHero = false,
}: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: '#fff',
        // `overflow-x: hidden` (not `overflow: hidden`) so vertical body
        // scroll works on mobile when the form is taller than the viewport.
        // The previous `overflow: hidden` clipped everything below the fold
        // and the user couldn't reach the "Acepto y continuar" button on
        // small screens. The decorative left-panel circles are contained
        // by their own `overflow: hidden`, not by this root.
        overflowX: 'hidden',
      }}
    >
      {/* LEFT panel (>= md). When `compactHero`, the panel is a fixed
          ~42% of the viewport (with a soft cap) instead of `flex: 1`,
          so the right column takes the lion's share on wide desktops
          where the hero would otherwise be 50% of empty space. */}
      <div
        className="hidden md:flex"
        style={{
          flex: compactHero ? '0 0 42%' : 1,
          maxWidth: compactHero ? 620 : undefined,
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
          <UmbAvatar size={48} variant="white" />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Mabel IA</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 1 }}>
              Universidad Manuela Beltrán
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
          <span>Tus conversaciones son privadas y confidenciales.</span>
        </div>
      </div>

      {/* MOBILE top header (< md). NOTE: `display` must be controlled via the
          className (flex md:hidden), NOT inline — inline styles override
          Tailwind's `md:hidden` and the header would leak into desktop. */}
      <div
        className="flex md:hidden"
        style={{
          padding: '20px 24px',
          background:
            'linear-gradient(160deg, var(--mabel-700) 0%, var(--mabel-600) 60%, var(--mabel-800) 100%)',
          color: '#fff',
          alignItems: 'center',
          gap: 10,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1,
        }}
      >
        <UmbAvatar size={32} variant="white" />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Mabel IA</div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>UMB</div>
        </div>
      </div>

      {/* RIGHT panel — formulario.
          Layout decisions:
          - `flex-direction: column` + `alignItems: center` (horizontal only)
            avoids the classic flex centering bug where `alignItems: center`
            with a child taller than the cross axis leaves the overflow
            unreachable above the visible area. With column layout and
            `margin: auto 0` on the child, the form centers vertically when
            it fits and pushes to the top when it doesn't — scroll natural.
          - `paddingTop: max(88px, ...)` reserves room for the mobile-only
            fixed header (~64px tall). On desktop the left panel is rendered
            in-flow so the 88px is just a regular top padding.
          - No `overflowY: auto` here — let the document body scroll. With
            the panel scrolling internally AND the root having `overflow:
            hidden`, mobile was double-clipping and the user couldn't reach
            the bottom of the form. */}
      <div
        // `pt-[…]` mobile = 88px (to clear the fixed mobile header) +
        // `env(safe-area-inset-top)` for iOS standalone PWA.
        // `md:pt-12` desktop = 48px, restoring the pre-mobile-fix top
        // padding because the mobile header is `md:hidden` (no header
        // to clear on desktop). Without the breakpoint gate, every auth
        // page sat 40px too low on desktops — visible regression.
        className="flex-1 fade-in pt-[calc(env(safe-area-inset-top)+88px)] md:pt-12"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 48,
          background: '#fff',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: wide ? 640 : 420,
            // `margin: auto 0` collapses to 0 when the child overflows the
            // panel (so the user can scroll), and centers vertically when
            // it fits — same UX as the previous `alignItems: center` but
            // without the unreachable-overflow trap.
            margin: 'auto 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
