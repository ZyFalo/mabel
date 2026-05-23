import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'

/**
 * Modal de confirmacion de hard-delete de una sesion. Patron del
 * agente etico (2026-05-23): texto explicito sobre que va a pasar
 * + input obligatorio "CONFIRMAR" antes de habilitar el boton rojo.
 *
 * Patron coherente con el bulk-delete del admin panel para que el
 * estudiante reconozca la gravedad del action.
 */
export default function ConfirmDeleteSessionModal({
  open,
  sessionTitle,
  onCancel,
  onConfirm,
  submitting,
}: {
  open: boolean
  sessionTitle: string
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Reset el texto cada vez que se abre el modal.
  useEffect(() => {
    if (open) {
      setConfirmText('')
      // Auto-focus para que el usuario pueda escribir sin click adicional
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting, onCancel])

  if (!open) return null

  const canSubmit = confirmText.trim().toUpperCase() === 'CONFIRMAR' && !submitting

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 17, 16, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
        fontFamily: 'var(--font-sans)',
      }}
      onClick={(e) => {
        // Click en backdrop cierra (solo si no está submitting)
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        className="scale-in"
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--ink-100)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trash2 size={18} color="var(--danger-600, #DC2626)" />
            <h2
              id="delete-modal-title"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--ink-900)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Eliminar conversación
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cerrar"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: 'var(--ink-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.background = 'var(--ink-100)'
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          <p
            style={{
              fontSize: 14,
              color: 'var(--ink-700)',
              margin: '0 0 12px',
              lineHeight: 1.55,
            }}
          >
            Vas a eliminar definitivamente la conversación{' '}
            <strong style={{ color: 'var(--ink-900)' }}>«{sessionTitle}»</strong>.
          </p>
          <p
            style={{
              fontSize: 13,
              color: 'var(--ink-600)',
              margin: '0 0 16px',
              lineHeight: 1.6,
            }}
          >
            <strong>Esta acción es irreversible.</strong> Los mensajes de esta
            conversación se eliminarán de nuestra base de datos. Las métricas
            anónimas (latencia, conteo de turnos, eventos de seguridad) podrán
            conservarse de forma disociada, según los términos que aceptaste.
          </p>
          <label
            htmlFor="delete-confirm-input"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-700)',
              marginBottom: 6,
            }}
          >
            Para confirmar, escribe <code style={codeChip}>CONFIRMAR</code> abajo:
          </label>
          <input
            id="delete-confirm-input"
            ref={inputRef}
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Escribe CONFIRMAR"
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: `1px solid ${canSubmit ? 'var(--danger-600, #DC2626)' : 'var(--ink-300)'}`,
              borderRadius: 8,
              fontSize: 14,
              color: 'var(--ink-900)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 22px 20px',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid var(--ink-300)',
              background: '#fff',
              color: 'var(--ink-700)',
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canSubmit}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: canSubmit
                ? 'var(--danger-600, #DC2626)'
                : 'var(--ink-200)',
              color: canSubmit ? '#fff' : 'var(--ink-400)',
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)',
              transition: 'background-color 0.15s ease',
            }}
          >
            {submitting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

const codeChip: React.CSSProperties = {
  background: 'var(--ink-100)',
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11.5,
  color: 'var(--ink-900)',
}
