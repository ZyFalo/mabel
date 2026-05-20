import { useState } from 'react'
import { X } from 'lucide-react'
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
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(26,17,16,0.32)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} aria-hidden />
      <div
        className="scale-in"
        style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-xl)',
          width: 'min(100%, 500px)',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px 26px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: 'var(--ink-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={16} />
        </button>

        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink-900)',
            margin: '0 0 4px',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.015em',
          }}
        >
          Reportar mensaje
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 18px', lineHeight: 1.55 }}>
          Ayudanos a mejorar Mabel IA.
        </p>

        {/* Reason */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-900)',
              marginBottom: 10,
            }}
          >
            Motivo <span style={{ color: 'var(--danger-600)' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {REASONS.map((r) => {
              const on = reason === r.value
              return (
                <label
                  key={r.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: on ? 'var(--mabel-50)' : '#fff',
                    border: `1px solid ${on ? 'var(--mabel-500)' : 'var(--ink-200)'}`,
                    transition: 'all var(--dur-fast) var(--ease-out)',
                  }}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={on}
                    onChange={() => setReason(r.value)}
                    style={{ accentColor: 'var(--mabel-600)' }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: on ? 'var(--mabel-700)' : 'var(--ink-700)',
                      fontWeight: on ? 600 : 500,
                    }}
                  >
                    {r.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Severity */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-900)',
              marginBottom: 10,
            }}
          >
            Severidad (opcional)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = severity === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSeverity(on ? null : n)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    background: on ? 'var(--mabel-600)' : 'var(--ink-100)',
                    color: on ? '#fff' : 'var(--ink-600)',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    transition: 'all var(--dur-fast) var(--ease-out)',
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        {/* Details */}
        <div style={{ marginBottom: 18 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-900)',
              marginBottom: 10,
            }}
          >
            Detalles (opcional)
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={3}
            placeholder="Describe el problema..."
            style={{
              width: '100%',
              padding: '11px 14px',
              background: '#fff',
              border: '1px solid var(--ink-200)',
              borderRadius: 10,
              fontSize: 13,
              color: 'var(--ink-900)',
              resize: 'none',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              boxSizing: 'border-box',
              transition: 'border-color var(--dur-fast) var(--ease-out)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--mabel-500)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--ink-200)')}
          />
          <p
            style={{
              fontSize: 11,
              textAlign: 'right',
              marginTop: 4,
              color: 'var(--ink-400)',
            }}
          >
            {details.length}/1000
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '11px 18px',
              background: 'transparent',
              color: 'var(--ink-700)',
              border: '1px solid var(--ink-300)',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            style={{
              padding: '11px 18px',
              background: !reason || submitting ? 'var(--ink-200)' : 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: !reason || submitting ? 'not-allowed' : 'pointer',
              opacity: !reason || submitting ? 0.6 : 1,
              fontFamily: 'var(--font-sans)',
              boxShadow: !reason || submitting ? 'none' : 'var(--shadow-sm)',
            }}
          >
            {submitting ? 'Enviando...' : 'Enviar reporte'}
          </button>
        </div>
      </div>
    </div>
  )
}
