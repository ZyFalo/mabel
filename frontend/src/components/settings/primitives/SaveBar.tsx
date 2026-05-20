import PrimaryButton from './PrimaryButton'

interface SaveBarProps {
  onClick: () => void
  label?: string
  disabled?: boolean
}

/**
 * SaveBar — bottom Save bar used at the end of each settings section.
 *
 * Adds a top border separator and renders a PrimaryButton with the
 * customizable label (default "Guardar cambios").
 */
export default function SaveBar({
  onClick,
  label = 'Guardar cambios',
  disabled,
}: SaveBarProps) {
  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 18,
        borderTop: '1px solid var(--ink-100)',
      }}
    >
      <PrimaryButton onClick={onClick} disabled={disabled}>
        {label}
      </PrimaryButton>
    </div>
  )
}
