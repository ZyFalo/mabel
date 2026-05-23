/**
 * ReactiveRings — Indicador visual del estado conversacional de Mabel.
 *
 * Por estado:
 *   - listening : badge flotante con icono Ear pulsando, halo verde
 *   - thinking  : badge flotante con icono Loader2 rotando, halo amber
 *   - speaking  : 3 anillos concentricos rojos expandiendose (sin badge,
 *                 el efecto de ondas saliendo ya comunica "habla")
 *   - idle/error: solo halo respirando
 *
 * Speaking se queda con la animación de líneas concéntricas porque el
 * usuario indicó que esa visualmente le gusta — comunica claramente
 * que el audio está saliendo del avatar.
 */
import { AudioLines, Ear, Loader2 } from 'lucide-react'
import type { AvatarState } from './MabelAvatar'

interface ReactiveRingsProps {
  state: AvatarState
}

// listening + thinking usan el patrón badge. speaking usa el patrón
// expanding rings (mantenido tal cual del prototipo original).
const BADGE_PRESETS: Partial<
  Record<
    AvatarState,
    {
      Icon: typeof Ear
      bg: string
      fg: string
      haloColor: string
      iconAnim: 'spin' | 'pulse'
    }
  >
> = {
  listening: {
    Icon: Ear,
    bg: 'var(--success-50)',
    fg: 'var(--success-600)',
    haloColor: 'rgba(5,150,105,0.25)',
    iconAnim: 'pulse',
  },
  thinking: {
    Icon: Loader2,
    bg: 'var(--warn-50)',
    fg: 'var(--warn-600)',
    haloColor: 'rgba(217,119,6,0.25)',
    iconAnim: 'spin',
  },
}

// AudioLines se usa solo como ícono accesorio en el chip de estado de
// abajo (no aquí). Pero lo importamos para que esté disponible si en
// el futuro decidimos volver al patrón badge para speaking.
void AudioLines

const SPEAKING_HALO = 'rgba(165,25,22,0.28)'
const DEFAULT_HALO = 'rgba(165,25,22,0.08)'

export default function ReactiveRings({ state }: ReactiveRingsProps) {
  const badge = BADGE_PRESETS[state]
  const isSpeaking = state === 'speaking'

  const haloColor = badge?.haloColor
    ?? (isSpeaking ? SPEAKING_HALO : DEFAULT_HALO)

  return (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {/* Halo de fondo siempre presente — respira suavemente. Cambia
          de color sutil según el estado para reforzar el mensaje. */}
      <div
        style={{
          position: 'absolute',
          inset: -32,
          borderRadius: 40,
          background: `radial-gradient(circle, ${haloColor} 0%, transparent 70%)`,
          animation: 'halo-breathe 3.5s ease-in-out infinite',
          transition: 'background var(--dur-base) var(--ease-out)',
        }}
      />

      {/* Speaking — 3 anillos rojos expandiéndose desde el frame.
          inset: 0 del contenedor padre (320×410) hace que parezcan
          "ondas de voz" que salen del avatar. */}
      {isSpeaking &&
        [0, 0.6, 1.2].map((delay, i) => (
          <div
            key={`sp-${i}`}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 36,
              border: '2px solid var(--mabel-400)',
              animation: `ring-out 1.8s ${delay}s var(--ease-out) infinite`,
              opacity: 0,
            }}
          />
        ))}

      {/* Badge flotante con icono — solo listening y thinking. Se
          posiciona arriba del frame para no tapar la cara. */}
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            zIndex: 3,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: badge.bg,
              color: badge.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow:
                '0 6px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)',
              border: `1px solid ${badge.fg}`,
              animation:
                badge.iconAnim === 'pulse'
                  ? 'voice-badge-pulse 1.4s ease-in-out infinite'
                  : 'none',
            }}
          >
            <badge.Icon
              size={22}
              strokeWidth={2.25}
              style={{
                animation:
                  badge.iconAnim === 'spin'
                    ? 'rotate 1.4s linear infinite'
                    : 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
