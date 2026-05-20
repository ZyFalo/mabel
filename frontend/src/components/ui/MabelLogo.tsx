import type { CSSProperties } from 'react'

interface MabelLogoProps {
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
}

/**
 * Mabel brand logo — circular "M" mark from the prototype.
 * Renders an SVG with `currentColor` by default so it can be tinted via CSS.
 */
export default function MabelLogo({
  size = 28,
  color = 'currentColor',
  className,
  style,
}: MabelLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill={color}
      stroke="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M16 3C8.8 3 3 8.8 3 16s5.8 13 13 13 13-5.8 13-13S23.2 3 16 3Zm-4.5 19V10h2.7l2.8 7.3L19.8 10h2.7v12h-1.9v-8.5L17.7 22h-1.4l-2.9-8.5V22h-1.9Z" />
    </svg>
  )
}
