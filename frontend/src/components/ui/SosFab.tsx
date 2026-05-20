interface SosFabProps {
  onOpen: () => void
}

/**
 * Floating bottom-right SOS button. Always visible during a student session.
 * The CrisisOverlay (SosPanel) is now rendered by `StudentLayout` so that
 * both this FAB and the sidebar's "Linea de crisis SOS" button trigger the
 * same modal.
 */
export default function SosFab({ onOpen }: SosFabProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white border-2 border-danger text-danger font-bold text-sm shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-40"
      aria-label="Abrir linea de crisis SOS"
      title="Linea de crisis SOS"
    >
      SOS
    </button>
  )
}
