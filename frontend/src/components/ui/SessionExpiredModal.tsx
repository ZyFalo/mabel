import { Clock } from 'lucide-react'

interface SessionExpiredModalProps {
  open: boolean
  onLogin: () => void
}

export default function SessionExpiredModal({ open, onLogin }: SessionExpiredModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg max-w-md w-full p-6 text-center scale-in">
        <div className="flex justify-center mb-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-hover)' }}
          >
            <Clock size={24} style={{ color: 'var(--warning)' }} />
          </div>
        </div>
        <h2 className="text-[18px] font-display italic text-[var(--text-strong)] mb-2">
          Sesion expirada
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-5 leading-relaxed">
          Tu sesion ha expirado. Por favor, inicia sesion nuevamente.
        </p>
        <button
          onClick={onLogin}
          className="w-full px-5 py-2.5 bg-[var(--accent)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          Ir al login
        </button>
      </div>
    </div>
  )
}
