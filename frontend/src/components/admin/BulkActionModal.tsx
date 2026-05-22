import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Trash2, X } from 'lucide-react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

/**
 * BulkActionModal — confirms a multi-user lifecycle action.
 *
 * Drives three operations from the /admin/users bulk-action bar:
 *
 *   - disable: requires a reason (audited per-target). Skips admins and
 *     users already disabled.
 *   - enable:  reverses a previous disable. Skips admins and users already
 *     active.
 *   - delete:  permanently removes a user (hard DELETE with cascade). ONLY
 *     applies to disabled users; active users are reported back as
 *     `skipped_must_disable_first`. Requires typing "CONFIRMAR" verbatim.
 *
 * The component computes a split preview client-side (eliminables vs.
 * skipped) so the admin sees, before submitting, how many of the selected
 * rows will actually receive the action.
 */

export interface BulkActionUser {
  id: string
  email_masked: string
  display_name?: string | null
  role: string
  disabled_at: string | null
}

interface BulkActionResponse {
  action: 'disable' | 'enable' | 'delete'
  applied: number
  skipped_admin: string[]
  skipped_already_state: string[]
  skipped_must_disable_first: string[]
  not_found: string[]
}

interface BulkActionModalProps {
  open: boolean
  action: 'disable' | 'enable' | 'delete'
  selected: BulkActionUser[]
  onClose: () => void
  onApplied: (response: BulkActionResponse) => void
}

const CONFIRM_WORD = 'CONFIRMAR'
const MIN_REASON_LENGTH = 10
const MAX_REASON_LENGTH = 500

interface Palette {
  bgHeader: string
  borderHeader: string
  textHeader: string
  iconBg: string
  iconColor: string
  cta: string
  ctaHover: string
  ctaRing: string
}

const PALETTES: Record<BulkActionModalProps['action'], Palette> = {
  disable: {
    bgHeader: 'var(--danger-50)',
    borderHeader: 'var(--danger-200)',
    textHeader: 'var(--danger-700)',
    iconBg: 'var(--danger-200)',
    iconColor: 'var(--danger-700)',
    cta: 'var(--danger-600)',
    ctaHover: 'var(--danger-700)',
    ctaRing: '0 0 0 4px rgba(220, 38, 38, 0.18)',
  },
  enable: {
    bgHeader: 'var(--success-50)',
    borderHeader: 'var(--success-200)',
    textHeader: 'var(--success-700)',
    iconBg: 'var(--success-200)',
    iconColor: 'var(--success-700)',
    cta: 'var(--success-600)',
    ctaHover: 'var(--success-700)',
    ctaRing: '0 0 0 4px rgba(5, 150, 105, 0.18)',
  },
  delete: {
    bgHeader: 'var(--danger-50)',
    borderHeader: 'var(--danger-200)',
    textHeader: 'var(--danger-700)',
    iconBg: 'var(--danger-200)',
    iconColor: 'var(--danger-700)',
    cta: 'var(--danger-600)',
    ctaHover: 'var(--danger-700)',
    ctaRing: '0 0 0 4px rgba(220, 38, 38, 0.18)',
  },
}

const TITLES: Record<BulkActionModalProps['action'], string> = {
  disable: 'Deshabilitar cuentas',
  enable: 'Reactivar cuentas',
  delete: 'Eliminar cuentas permanentemente',
}

const CTA_LABELS: Record<
  BulkActionModalProps['action'],
  { idle: string; busy: string }
> = {
  disable: { idle: 'Deshabilitar', busy: 'Deshabilitando…' },
  enable: { idle: 'Reactivar', busy: 'Reactivando…' },
  delete: { idle: 'Eliminar permanentemente', busy: 'Eliminando…' },
}

export default function BulkActionModal({
  open,
  action,
  selected,
  onClose,
  onApplied,
}: BulkActionModalProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [reason, setReason] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setConfirmWord('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, action])

  // Client-side split so the admin sees the impact before submitting. The
  // backend recomputes everything authoritatively; this is purely UX.
  const split = useMemo(() => {
    const admins: BulkActionUser[] = []
    const eligible: BulkActionUser[] = []
    const alreadyState: BulkActionUser[] = []
    const mustDisableFirst: BulkActionUser[] = []

    for (const u of selected) {
      if (u.role === 'admin') {
        admins.push(u)
        continue
      }
      const isDisabled = u.disabled_at !== null
      if (action === 'disable') {
        if (isDisabled) alreadyState.push(u)
        else eligible.push(u)
      } else if (action === 'enable') {
        if (!isDisabled) alreadyState.push(u)
        else eligible.push(u)
      } else {
        // delete
        if (isDisabled) eligible.push(u)
        else mustDisableFirst.push(u)
      }
    }
    return { admins, eligible, alreadyState, mustDisableFirst }
  }, [selected, action])

  if (!open) return null

  const palette = PALETTES[action]
  const trimmedReason = reason.trim()

  // Submission gating. `delete` needs the literal "CONFIRMAR"; `disable`
  // needs a reason of MIN_REASON_LENGTH+; `enable` is unconditional.
  const reasonOk =
    action !== 'disable' || trimmedReason.length >= MIN_REASON_LENGTH
  const confirmOk = action !== 'delete' || confirmWord === CONFIRM_WORD
  const hasEligible = split.eligible.length > 0
  const canSubmit = !submitting && hasEligible && reasonOk && confirmOk

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // We send ALL selected ids — the backend filters and reports skips
      // authoritatively. Sending only `eligible` would hide server-side
      // discrepancies (e.g. a row that flipped state between fetch and
      // submit).
      const payload: {
        user_ids: string[]
        action: BulkActionModalProps['action']
        reason?: string
      } = {
        user_ids: selected.map((u) => u.id),
        action,
      }
      if (action === 'disable') payload.reason = trimmedReason

      const res = await apiClient.post<BulkActionResponse>(
        '/admin/users/bulk-action',
        payload,
      )
      onApplied(res.data)
      onClose()
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string } }
      }
      setError(
        e?.response?.data?.detail ??
          'No fue posible aplicar la acción. Inténtalo nuevamente.',
      )
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (submitting) return
    onClose()
  }

  const Icon = action === 'enable' ? CheckCircle2 : action === 'delete' ? Trash2 : AlertTriangle

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: 16, fontFamily: 'var(--font-sans)' }}
    >
      <div
        className="absolute inset-0 fade-in"
        style={{
          background: 'rgba(26, 17, 16, 0.45)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-action-title"
        className="relative scale-in"
        style={{
          background: 'var(--white)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-xl)',
          width: '100%',
          maxWidth: 540,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: palette.bgHeader,
            borderBottom: `1px solid ${palette.borderHeader}`,
            padding: '18px 22px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div className="flex items-start" style={{ gap: 12 }}>
            <span
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: palette.iconBg,
                color: palette.iconColor,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: palette.textHeader,
                  textTransform: 'uppercase',
                  letterSpacing: '0.16em',
                  margin: 0,
                  opacity: 0.85,
                }}
              >
                Acción administrativa
              </p>
              <h2
                id="bulk-action-title"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: palette.textHeader,
                  margin: 0,
                  marginTop: 4,
                  letterSpacing: '-0.01em',
                }}
              >
                {TITLES[action]} ({selected.length})
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Cerrar"
            style={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              color: palette.textHeader,
              background: 'transparent',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.4 : 0.8,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {/* Split preview */}
          <div
            style={{
              background: 'var(--ink-50)',
              border: '1px solid var(--ink-200)',
              borderRadius: 'var(--r-md)',
              padding: '12px 14px',
              fontSize: 12.5,
              color: 'var(--ink-700)',
              lineHeight: 1.55,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--ink-500)',
                marginBottom: 8,
              }}
            >
              Impacto de la acción
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <li>
                <strong
                  style={{
                    color:
                      split.eligible.length > 0
                        ? 'var(--ink-900)'
                        : 'var(--ink-500)',
                  }}
                >
                  {split.eligible.length}
                </strong>{' '}
                {action === 'delete'
                  ? 'se eliminarán (cuentas deshabilitadas)'
                  : action === 'disable'
                    ? 'se deshabilitarán'
                    : 'se reactivarán'}
              </li>
              {split.alreadyState.length > 0 && (
                <li style={{ color: 'var(--ink-500)' }}>
                  <strong>{split.alreadyState.length}</strong>{' '}
                  {action === 'disable'
                    ? 'ya estaban deshabilitadas (se omiten)'
                    : 'ya estaban activas (se omiten)'}
                </li>
              )}
              {split.mustDisableFirst.length > 0 && (
                <li style={{ color: 'var(--warn-700)' }}>
                  <strong>{split.mustDisableFirst.length}</strong> activas:
                  para eliminarlas primero deshabilítalas (se omiten)
                </li>
              )}
              {split.admins.length > 0 && (
                <li style={{ color: 'var(--ink-500)' }}>
                  <strong>{split.admins.length}</strong> administrador(es): se
                  omiten por protección
                </li>
              )}
            </ul>
          </div>

          {!hasEligible && (
            <div
              role="alert"
              style={{
                border: '1px solid var(--warn-200)',
                background: 'var(--warn-50)',
                color: 'var(--warn-700)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                fontSize: 13,
              }}
            >
              Ninguna de las cuentas seleccionadas puede recibir esta acción
              en su estado actual.
            </div>
          )}

          {/* Reason (disable only) */}
          {action === 'disable' && hasEligible && (
            <div>
              <label
                htmlFor="bulk-reason"
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--ink-600)',
                  marginBottom: 6,
                }}
              >
                Razón de la deshabilitación
                <span style={{ color: 'var(--danger-600)', marginLeft: 4 }}>
                  *
                </span>
              </label>
              <textarea
                id="bulk-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
                placeholder="Ej.: Cierre de período académico — cohorte piloto-fase1."
                rows={3}
                disabled={submitting}
                style={{
                  width: '100%',
                  border: '1px solid var(--ink-200)',
                  borderRadius: 'var(--r-md)',
                  padding: '10px 12px',
                  fontSize: 13.5,
                  color: 'var(--ink-900)',
                  background: submitting ? 'var(--ink-50)' : 'var(--white)',
                  resize: 'none',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              />
              <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                <p
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color:
                      trimmedReason.length === 0
                        ? 'var(--ink-400)'
                        : trimmedReason.length < MIN_REASON_LENGTH
                          ? 'var(--warn-700)'
                          : 'var(--success-700)',
                  }}
                >
                  {trimmedReason.length === 0
                    ? `Mínimo ${MIN_REASON_LENGTH} caracteres`
                    : trimmedReason.length < MIN_REASON_LENGTH
                      ? `Faltan ${MIN_REASON_LENGTH - trimmedReason.length} caracteres`
                      : 'Razón válida (se aplicará a todas las cuentas elegibles)'}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    margin: 0,
                    color: 'var(--ink-400)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {reason.length}/{MAX_REASON_LENGTH}
                </p>
              </div>
            </div>
          )}

          {/* CONFIRMAR (delete only) */}
          {action === 'delete' && hasEligible && (
            <div>
              <label
                htmlFor="bulk-confirm"
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  color: 'var(--ink-600)',
                  marginBottom: 6,
                }}
              >
                Escribe <code style={{ color: 'var(--danger-700)' }}>CONFIRMAR</code> para
                proceder
                <span style={{ color: 'var(--danger-600)', marginLeft: 4 }}>*</span>
              </label>
              <input
                id="bulk-confirm"
                type="text"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="CONFIRMAR"
                autoComplete="off"
                disabled={submitting}
                style={{
                  width: '100%',
                  border: '1px solid var(--ink-200)',
                  borderRadius: 'var(--r-md)',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: 'var(--ink-900)',
                  background: submitting ? 'var(--ink-50)' : 'var(--white)',
                  fontFamily: 'var(--font-mono, monospace)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  outline: 'none',
                }}
              />
              <p
                style={{
                  fontSize: 11,
                  margin: '6px 0 0 0',
                  color: 'var(--danger-700)',
                  lineHeight: 1.45,
                }}
              >
                La eliminación es <strong>permanente</strong>. Se borran sesiones,
                mensajes y datos relacionados (los eventos de seguridad
                conservan el registro de forma anónima). Esta acción no se
                puede revertir.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                border: '1px solid var(--danger-200)',
                background: 'var(--danger-50)',
                color: 'var(--danger-700)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            background: 'var(--ink-50)',
            borderTop: '1px solid var(--ink-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ink-600)',
              background: 'transparent',
              borderRadius: 9999,
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center"
            style={{
              gap: 8,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--white)',
              background: palette.cta,
              borderRadius: 9999,
              border: `1px solid ${palette.cta}`,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.5,
              transition:
                'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              if (!canSubmit) return
              ;(e.currentTarget as HTMLElement).style.background = palette.ctaHover
              ;(e.currentTarget as HTMLElement).style.borderColor = palette.ctaHover
              ;(e.currentTarget as HTMLElement).style.boxShadow = palette.ctaRing
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = palette.cta
              ;(e.currentTarget as HTMLElement).style.borderColor = palette.cta
              ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
            }}
          >
            {submitting && (
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: 'var(--white)',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
            )}
            <span>
              {submitting ? CTA_LABELS[action].busy : CTA_LABELS[action].idle}
            </span>
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
