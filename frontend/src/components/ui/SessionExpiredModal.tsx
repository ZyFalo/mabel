interface SessionExpiredModalProps {
  open: boolean
  onLogin: () => void
}

export default function SessionExpiredModal({ open, onLogin }: SessionExpiredModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 text-center">
        <svg className="w-12 h-12 text-warning mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-lg font-bold text-text-primary mb-2">Sesion expirada</h2>
        <p className="text-sm text-text-primary/60 mb-5">
          Tu sesion ha expirado. Por favor, inicia sesion nuevamente.
        </p>
        <button
          onClick={onLogin}
          className="w-full py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Ir al login
        </button>
      </div>
    </div>
  )
}
