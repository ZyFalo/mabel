import { useState } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: 'simple' | 'verification'
  verificationText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  variant = 'simple',
  verificationText = 'ELIMINAR',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [input, setInput] = useState('')

  if (!open) return null

  const canConfirm = variant === 'simple' || input === verificationText

  function handleConfirm() {
    if (!canConfirm) return
    setInput('')
    onConfirm()
  }

  function handleCancel() {
    setInput('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={handleCancel} />
      <div className="relative bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-lg max-w-md w-full p-6 scale-in">
        <h2 className="text-[18px] font-display italic text-[var(--ink-900)] mb-2">
          {title}
        </h2>
        <p className="text-[13px] text-[var(--ink-500)] mb-4 leading-relaxed">{message}</p>

        {variant === 'verification' && (
          <div className="mb-4">
            <label className="text-[13px] text-[var(--ink-500)] block mb-1.5">
              Escribe{' '}
              <strong className="text-[var(--ink-900)]">{verificationText}</strong> para confirmar
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-[#fff] border border-[var(--ink-200)] rounded-lg px-3 py-2.5 text-[14px] text-[var(--ink-700)] placeholder:text-[var(--ink-400)] focus:outline-none focus:border-[var(--mabel-600)] transition-colors"
              placeholder={verificationText}
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] text-[13px] font-medium rounded-lg hover:bg-[var(--ink-100)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-5 py-2.5 text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--danger-600)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
