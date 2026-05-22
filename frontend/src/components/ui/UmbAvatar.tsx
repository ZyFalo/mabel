import type { CSSProperties } from 'react'

interface UmbAvatarProps {
  /** Width and height in px. The PNG keeps aspect ratio via objectFit. */
  size?: number
  /**
   * Shield color variant.
   *  - `red` (default): use the red shield. Designed for light-coloured
   *    parent backgrounds (white cards, ink-50 surfaces, the sidebar).
   *  - `white`: use the white silhouette. Only needed where the parent
   *    background is red/mabel — AuthShell's gradient panel and its
   *    mobile header strip.
   */
  variant?: 'red' | 'white'
  /** Extra style overrides on the image. */
  style?: CSSProperties
  /** ARIA label; set to '' to mark decorative. */
  alt?: string
}

/**
 * Brand mark — Escudo UMB. Rendered as a bare image with no circular
 * wrapper, no background, no border. Mabel's institutional identity comes
 * from the shield silhouette itself; we don't decorate it with a coloured
 * disc anymore.
 *
 * Two PNGs in `public/brand/`:
 *   - `umb-shield.png` (red on transparent)
 *   - `umb-shield-white.png` (white on transparent)
 *
 * Trade-off: at sizes below ~28px the "UMB" wordmark under the silhouette
 * becomes illegible. Only the head profile remains recognisable. This is
 * accepted per the brand decision to use the shield as Mabel's avatar.
 */
export default function UmbAvatar({
  size = 40,
  variant = 'red',
  style,
  alt = 'Escudo Universidad Manuela Beltrán',
}: UmbAvatarProps) {
  const src = variant === 'white' ? '/brand/umb-shield-white.png' : '/brand/umb-shield.png'
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
