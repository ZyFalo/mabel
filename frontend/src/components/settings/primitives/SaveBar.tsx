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
        // Decisión PO 2026-05-27 (revertido CR-C2): NO reservar
        // safe-area-bottom. El usuario prefiere consistencia con
        // el resto de la app (commit c826b84) — sin franja blanca
        // al fondo. El botón "Guardar cambios" puede solaparse
        // visualmente con el home indicator de iOS pero sigue
        // tappable (iOS solo reserva el gesto swipe, no taps).
        borderTop: '1px solid var(--ink-100)',
      }}
    >
      <PrimaryButton onClick={onClick} disabled={disabled}>
        {label}
      </PrimaryButton>
    </div>
  )
}
