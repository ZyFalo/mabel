import { useState } from 'react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

const REASONS = [
  { value: 'hallucination', label: 'Alucinacion' },
  { value: 'harmful', label: 'Contenido danino' },
  { value: 'privacy', label: 'Privacidad' },
  { value: 'low_empathy', label: 'Baja empatia' },
  { value: 'other', label: 'Otro' },
] as const

interface ReportModalProps {
  messageId: string
  onClose: () => void
  onReported: (messageId: string) => void
}

export default function ReportModal({ messageId, onClose, onReported }: ReportModalProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [reason, setReason] = useState<string | null>(null)
  const [severity, setSeverity] = useState<number | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!reason) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { reason }
      if (severity !== null) body.severity = severity
      if (details.trim()) body.details = details.trim()

      await apiClient.post(`/messages/${messageId}/reports`, body)
      addToast({ type: 'success', message: 'Reporte enviado' })
      onReported(messageId)
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } }
      if (error.response?.status === 409) {
        addToast({ type: 'info', message: 'Ya reportaste este mensaje' })
        onReported(messageId)
      } else {
        addToast({ type: 'error', message: 'Error al enviar reporte' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-bold text-text-primary mb-4">Reportar mensaje</h2>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Motivo <span className="text-danger">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  reason === r.value ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-primary"
                />
                <span className="text-sm text-text-primary">{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Severidad (opcional)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setSeverity(severity === n ? null : n)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  severity === n
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-text-primary/60 hover:bg-gray-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Detalles (opcional)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={3}
            placeholder="Describe el problema..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-text-primary/40 text-right mt-1">{details.length}/1000</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-primary/60 hover:text-text-primary rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  )
}
