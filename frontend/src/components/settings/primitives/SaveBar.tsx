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
        // CR-C2 (review 2026-05-27): paddingBottom respeta el
        // safe-area del home indicator de iOS PWA. El comment del
        // index.css §Settings prometía que el SaveBar tenía esto;
        // antes no. Sin el inset, el botón "Guardar cambios" sit
        // bajo el home indicator y se ve clipped visualmente. En
        // devices sin home indicator (Android, desktop) el var
        // cae a 0px y no hay padding extra.
        paddingBottom: 'var(--safe-bottom)',
        borderTop: '1px solid var(--ink-100)',
      }}
    >
      <PrimaryButton onClick={onClick} disabled={disabled}>
        {label}
      </PrimaryButton>
    </div>
  )
}
