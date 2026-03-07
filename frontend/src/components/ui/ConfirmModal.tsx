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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-primary/60 mb-4">{message}</p>

        {variant === 'verification' && (
          <div className="mb-4">
            <label className="text-sm text-text-primary/60 block mb-1">
              Escribe <strong>{verificationText}</strong> para confirmar
            </label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={verificationText}
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-text-primary/60 hover:text-text-primary rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
