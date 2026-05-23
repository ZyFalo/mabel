/**
 * MabelAvatar — Avatar 2D ilustrado de Mabel para modo voz.
 *
 * Renderiza un PNG base (`mabel-figure-clean.png`, 350x649px, cara
 * "limpia" sin features) y dibuja encima un SVG con cejas/ojos/boca
 * animados segun el estado conversacional. Esto evita tener 5 PNGs
 * separados y permite transicionar suavemente entre estados via CSS.
 *
 * Coords de las features en el espacio del PNG (350x649):
 *   Cejas: y~=155, ojo izq x~=126, ojo der x~=219
 *   Ojos:  y~=185, ojo izq x~=132, ojo der x~=224, radio 9px
 *   Boca:  x~=180 (centro), y~=258, ancho ~=48
 */

export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'

interface MabelAvatarProps {
  state?: AvatarState
  /** Si no se pasa, el avatar ocupa el 100% del contenedor padre
   *  (manteniendo aspect-ratio W:H). Util para layouts responsive
   *  donde el padre controla el tamaño via CSS. */
  size?: number
}

const W = 350
const H = 649

export default function MabelAvatar({
  state = 'idle',
  size,
}: MabelAvatarProps) {
  const isError = state === 'error'
  const eyesUp = state === 'thinking'
  const speaking = state === 'speaking'
  const listening = state === 'listening'

  const browStroke = '#999999'
  const eyeR = 9
  const eyeRy = listening ? 2.5 : 9
  const eyeCY = eyesUp ? 180 : 185
  const browY = eyesUp ? 145 : 155

  // Si `size` se pasa explicito, dimensiones fijas (uso legacy). Si no,
  // el padre dimensiona via CSS y nosotros mantenemos solo el
  // aspect-ratio del PNG.
  const dimensions = size
    ? { width: size, height: size * (H / W) }
    : { width: '100%', aspectRatio: `${W} / ${H}` as const }

  return (
    <div
      role="img"
      aria-label={`Avatar de Mabel — estado ${state}`}
      style={{
        position: 'relative',
        ...dimensions,
        filter: isError ? 'grayscale(0.55) opacity(0.78)' : 'none',
        transition: 'filter var(--dur-base) var(--ease-out)',
      }}
    >
      {/* Base PNG sin features */}
      <img
        src="/avatar/mabel-figure-clean.png"
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* SVG overlay con features animadas en coords del PNG */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {/* CEJAS */}
        {isError ? (
          <>
            <path
              d={`M ${126 - 23} ${browY + 8} L ${126 + 23} ${browY - 2}`}
              stroke={browStroke}
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${219 - 23} ${browY - 2} L ${219 + 23} ${browY + 8}`}
              stroke={browStroke}
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : (
          <>
            <path
              d={`M ${126 - 23} ${browY + 3} Q ${126} ${browY - 4}, ${126 + 23} ${browY + 3}`}
              stroke={browStroke}
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
              style={{ transition: 'd var(--dur-base) var(--ease-out)' }}
            />
            <path
              d={`M ${219 - 23} ${browY + 3} Q ${219} ${browY - 4}, ${219 + 23} ${browY + 3}`}
              stroke={browStroke}
              strokeWidth="5.5"
              strokeLinecap="round"
              fill="none"
              style={{ transition: 'd var(--dur-base) var(--ease-out)' }}
            />
          </>
        )}

        {/* OJOS */}
        <ellipse
          cx="132"
          cy={eyeCY}
          rx={eyeR}
          ry={eyeRy}
          fill="#9F9F9F"
          style={{
            transition:
              'ry var(--dur-base) var(--ease-out), cy var(--dur-base) var(--ease-out)',
          }}
        />
        <ellipse
          cx="224"
          cy={eyeCY}
          rx={eyeR}
          ry={eyeRy}
          fill="#9F9F9F"
          style={{
            transition:
              'ry var(--dur-base) var(--ease-out), cy var(--dur-base) var(--ease-out)',
          }}
        />

        {/* BOCA — anima al hablar */}
        <g
          style={{
            transformOrigin: '180px 258px',
            animation: speaking
              ? 'mouth-talk 0.32s ease-in-out infinite alternate'
              : 'none',
          }}
        >
          {isError ? (
            <path
              d="M 156 264 Q 180 256, 204 264"
              stroke="#888888"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          ) : eyesUp ? (
            <ellipse cx="180" cy="258" rx="9" ry="2.5" fill="#888888" />
          ) : (
            <path
              d="M 156 256 Q 180 266, 204 256 Q 198 261, 180 261 Q 162 261, 156 256 Z"
              fill="#888888"
            />
          )}
        </g>
      </svg>
    </div>
  )
}
