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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg max-w-md w-full p-6 scale-in">
        <h2 className="text-[18px] font-display italic text-[var(--text-strong)] mb-1">
          Reportar mensaje
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-5">
          Ayudanos a mejorar Mabel IA.
        </p>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-[13px] font-medium text-[var(--text-strong)] mb-2">
            Motivo <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <div className="flex flex-col gap-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  borderColor: reason === r.value ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: reason === r.value ? 'var(--bg-hover)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span className="text-[13px] text-[var(--text)]">{r.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="mb-4">
          <label className="block text-[13px] font-medium text-[var(--text-strong)] mb-2">
            Severidad (opcional)
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setSeverity(severity === n ? null : n)}
                className="w-9 h-9 rounded-lg text-[13px] font-medium transition-colors"
                style={{
                  backgroundColor: severity === n ? 'var(--accent)' : 'var(--bg-hover)',
                  color: severity === n ? 'white' : 'var(--text-muted)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium text-[var(--text-strong)] mb-2">
            Detalles (opcional)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={3}
            placeholder="Describe el problema..."
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-placeholder)] resize-none focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <p className="text-[11px] text-right mt-1" style={{ color: 'var(--text-faint)' }}>
            {details.length}/1000
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] text-[13px] font-medium rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="px-5 py-2.5 bg-[var(--accent)] text-white text-[13px] font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  )
}
