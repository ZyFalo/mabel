import { useToastStore } from '../../stores/toastStore'

export default function SosFab() {
  const addToast = useToastStore((s) => s.addToast)

  return (
    <button
      onClick={() => addToast({ type: 'info', message: 'Panel SOS — Disponible en Fase 4' })}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white border-2 border-danger text-danger font-bold text-sm shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-40"
      aria-label="SOS"
    >
      SOS
    </button>
  )
}
