import { useEffect, useRef, useState } from 'react'
import { EyeOff, X } from 'lucide-react'

/**
 * Modal de confirmacion del toggle "Guardar historial" → OFF.
 * Texto verbatim del agente etico (2026-05-23). Cumple Ley 1581
 * art. 4 lit. g (transparencia) + Decreto 1377 art. 5 (informacion
 * previa) — informa la asimetria one-way del toggle ANTES de pedir
 * confirmacion.
 *
 * Cuando scope=`solo_uso` (sin base legal para retener), el backend
 * ejecuta hard DELETE en lugar de soft-hide. El modal muestra
 * dinamicamente el comportamiento esperado para que el usuario sepa
 * exactamente que va a pasar — esto es lo que diferencia el copy
 * "se ocultaran" de "se eliminaran de forma definitiva".
 */
export default function ConfirmHideHistoryModal({
  open,
  scope,
  onCancel,
  onConfirm,
  submitting,
}: {
  open: boolean
  /** Scope vigente del consentimiento: `solo_uso` / `uso_mejora_anon` / `uso_investigacion`. Null si aun no se cargo. */
  scope: string | null
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setConfirmText('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

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
  // Ramificacion B-04 del agente etico (2026-05-23): los usuarios con
  // scope=solo_uso o sin consentimiento NO autorizaron retencion para
  // analisis. El backend hara hard DELETE; el modal debe ser honesto
  // sobre eso.
  const willHardDelete = scope === 'solo_uso' || scope === null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hide-history-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 17, 16, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 20,
        fontFamily: 'var(--font-sans)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        className="scale-in"
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 540,
          width: '100%',
          boxShadow: '0 20px 50px -10px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
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
            <EyeOff size={18} color="var(--mabel-600)" />
            <h2
              id="hide-history-title"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--ink-900)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Ocultar tu historial de conversaciones
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cerrar"
            style={closeButtonStyle(submitting)}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.background = 'var(--ink-100)'
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          <p style={paragraphStyle}>
            Si desactivas esta opción, <strong>tus conversaciones pasadas dejarán
            de aparecer en tu barra lateral</strong>. Las conversaciones nuevas
            que inicies a partir de ahora tampoco se mostrarán.
          </p>

          <p style={{ ...paragraphStyle, fontWeight: 600, color: 'var(--ink-900)' }}>
            Es importante que sepas que:
          </p>
          <ul style={ulStyle}>
            {willHardDelete ? (
              <li>
                Como tu consentimiento actual es{' '}
                <strong>«solo uso»</strong>, tus conversaciones se{' '}
                <strong style={{ color: 'var(--danger-700, #B91C1C)' }}>
                  eliminarán de forma definitiva
                </strong>{' '}
                de nuestra base de datos. No se conservan para análisis ni para
                la investigación.
              </li>
            ) : (
              <li>
                Tus conversaciones <strong>no se eliminan</strong> de nuestra
                base de datos. La Universidad las conserva para análisis
                agregados, métricas de mejora del producto y para la
                investigación de la tesis, según el consentimiento{' '}
                <span style={scopeChip}>{scope ?? '—'}</span> que firmaste al
                registrarte.
              </li>
            )}
            <li>
              Si más adelante reactivas la opción,{' '}
              <strong>
                tus conversaciones anteriores no volverán a aparecer en la barra
                lateral
              </strong>
              {' '}— solo se mostrarán las nuevas. Esto es así para que no
              parezca un cambio trivial.
            </li>
            {!willHardDelete && (
              <li>
                Si quieres que tus datos se{' '}
                <strong>eliminen de verdad</strong>, usa la opción{' '}
                <em>«Eliminar mis datos»</em> en Configuración → Privacidad. Ese
                es tu derecho bajo la Ley 1581 de 2012.
              </li>
            )}
          </ul>

          <label htmlFor="hide-history-confirm" style={confirmLabelStyle}>
            Para confirmar, escribe <code style={codeChipStyle}>CONFIRMAR</code>{' '}
            abajo:
          </label>
          <input
            id="hide-history-confirm"
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
              border: `1px solid ${canSubmit ? 'var(--mabel-600)' : 'var(--ink-300)'}`,
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
            borderTop: '1px solid var(--ink-100)',
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
                ? willHardDelete
                  ? 'var(--danger-600, #DC2626)'
                  : 'var(--mabel-600)'
                : 'var(--ink-200)',
              color: canSubmit ? '#fff' : 'var(--ink-400)',
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-sans)',
              transition: 'background-color 0.15s ease',
            }}
          >
            {submitting
              ? 'Procesando…'
              : willHardDelete
                ? 'Eliminar mi historial'
                : 'Ocultar mi historial'}
          </button>
        </div>
      </div>
    </div>
  )
}

const paragraphStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--ink-700)',
  margin: '0 0 12px',
  lineHeight: 1.55,
}

const ulStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-600)',
  lineHeight: 1.6,
  paddingLeft: 20,
  margin: '0 0 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const confirmLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-700)',
  marginBottom: 6,
  marginTop: 6,
}

const codeChipStyle: React.CSSProperties = {
  background: 'var(--ink-100)',
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11.5,
  color: 'var(--ink-900)',
}

const scopeChip: React.CSSProperties = {
  background: 'var(--ink-100)',
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11.5,
  color: 'var(--ink-700)',
}

function closeButtonStyle(submitting: boolean): React.CSSProperties {
  return {
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
  }
}
