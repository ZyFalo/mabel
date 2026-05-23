import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'

/**
 * UserDetailDrawer — side panel that shows a user's key info inline,
 * triggered by clicking a row in the admin users table.
 *
 * Design intent: click on a row should NOT take the admin out of the
 * table context (losing scroll position, filters, selection state). The
 * drawer shows enough info to triage in 80% of cases — for the deep
 * detail page (audit history, raw fields, individual disable/enable/
 * delete actions) the admin clicks "Ver ficha completa" which routes
 * to /admin/users/:id.
 *
 * The shape mirrors `UserAdminDetail` in UserDetail.tsx (single API:
 * `GET /admin/users/:id`). We re-implement a lightweight adapter here
 * instead of importing it to avoid coupling the drawer to the page
 * component file — keeps the drawer reusable from other tables in
 * the future.
 */

interface RawUserDetail {
  id: string
  email_masked: string
  display_name: string | null
  role: string
  cohort: string | null
  created_at: string
  disabled_at: string | null
  disabled_reason: string | null
  consent_status?: string | null
  consent_version?: string | null
  consent_scope?: string | null
  consent_accepted_at?: string | null
  consent_revoked_at?: string | null
  total_sessions: number
  total_messages: number
  last_session_at: string | null
  total_reports_filed: number
  total_safety_events: number
  save_history?: boolean
  checkin_enabled?: boolean
  tts_enabled?: boolean
}

interface UserDetailDrawerProps {
  userId: string | null
  onClose: () => void
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

const SCOPE_LABEL: Record<string, string> = {
  solo_uso: 'Solo uso',
  uso_mejora_anon: 'Uso + mejora anónima',
}

export default function UserDetailDrawer({ userId, onClose }: UserDetailDrawerProps) {
  const navigate = useNavigate()
  const [data, setData] = useState<RawUserDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on ESC. Captured at window level because the drawer is a
  // floating overlay, not a focused form — we don't want to require
  // the admin to click into it first to dismiss.
  useEffect(() => {
    if (!userId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userId, onClose])

  // Fetch detail when a userId arrives. Cleanup pattern: bump a local
  // requestId so a stale response from a previously-clicked user doesn't
  // overwrite the newer one. Without this, clicking quickly through
  // rows could show the wrong user's data for a moment.
  useEffect(() => {
    if (!userId) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    apiClient
      .get<RawUserDetail>(`/admin/users/${userId}`)
      .then((res) => {
        if (cancelled) return
        setData(res.data ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? 'No se pudo cargar el detalle del usuario.'
        setError(msg)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) return null

  return (
    <>
      {/* Backdrop — click anywhere outside the drawer closes it. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(26, 17, 16, 0.35)',
          zIndex: 50,
          animation: 'fade-in var(--dur-fast) var(--ease-out)',
        }}
      />
      {/* Drawer panel — fixed right, slide-in. */}
      <aside
        role="dialog"
        aria-label="Detalle de usuario"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(440px, 92vw)',
          background: '#fff',
          boxShadow: '-12px 0 32px -8px rgba(26, 17, 16, 0.18)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
          animation: 'slide-in-right var(--dur-base) var(--ease-out)',
        }}
      >
        <header
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--ink-200)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--ink-500)',
                margin: 0,
              }}
            >
              Detalle de usuario
            </p>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--ink-900)',
                margin: '4px 0 0',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              {loading ? 'Cargando…' : data?.display_name ?? 'Sin nombre'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 20,
              color: 'var(--ink-500)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = 'var(--ink-100)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = 'transparent')
            }
          >
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{
                    height: 56,
                    background: 'var(--ink-100)',
                    borderRadius: 8,
                  }}
                />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'var(--danger-50)',
                color: 'var(--danger-700)',
                border: '1px solid var(--danger-200)',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : data ? (
            <div className="flex flex-col gap-4">
              <Section title="Identidad">
                <Row label="Email" value={data.email_masked} mono />
                <Row label="Rol" value={data.role} />
                <Row label="ID" value={data.id.slice(0, 8) + '…'} mono />
                <Row label="Registrado" value={formatDate(data.created_at)} />
              </Section>

              <Section title="Estado">
                <Row
                  label="Estado de cuenta"
                  value={
                    data.disabled_at ? (
                      <span style={{ color: 'var(--danger-700)' }}>
                        Deshabilitada
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success-700)' }}>Activa</span>
                    )
                  }
                />
                {data.disabled_at && (
                  <>
                    <Row label="Deshabilitada" value={formatDateTime(data.disabled_at)} />
                    {data.disabled_reason && (
                      <Row label="Motivo" value={data.disabled_reason} />
                    )}
                  </>
                )}
                <Row label="Cohorte" value={data.cohort ?? '—'} />
              </Section>

              <Section title="Consentimiento">
                {data.consent_status ? (
                  <>
                    <Row
                      label="Estado"
                      value={
                        data.consent_revoked_at
                          ? 'Revocado'
                          : data.consent_status === 'new_version_required'
                            ? 'Nueva versión requerida'
                            : 'Vigente'
                      }
                    />
                    <Row label="Versión" value={data.consent_version ?? '—'} />
                    <Row
                      label="Alcance"
                      value={
                        SCOPE_LABEL[data.consent_scope ?? ''] ??
                        data.consent_scope ??
                        '—'
                      }
                    />
                    <Row
                      label="Aceptado"
                      value={formatDateTime(data.consent_accepted_at)}
                    />
                    {data.consent_revoked_at && (
                      <Row
                        label="Revocado"
                        value={formatDateTime(data.consent_revoked_at)}
                      />
                    )}
                  </>
                ) : (
                  <Row label="Estado" value="Sin consentimiento" />
                )}
              </Section>

              <Section title="Actividad">
                <Row label="Sesiones totales" value={data.total_sessions} />
                <Row
                  label="Última sesión"
                  value={formatDateTime(data.last_session_at)}
                />
                <Row
                  label="Mensajes promedio/sesión"
                  value={
                    data.total_sessions > 0
                      ? (data.total_messages / data.total_sessions).toFixed(1)
                      : '—'
                  }
                />
                <Row label="Reportes presentados" value={data.total_reports_filed} />
                <Row label="Eventos de seguridad" value={data.total_safety_events} />
              </Section>

              {(data.save_history !== undefined ||
                data.checkin_enabled !== undefined) && (
                <Section title="Preferencias">
                  <Row
                    label="Guarda historial"
                    value={data.save_history ? 'Sí' : 'No'}
                  />
                  <Row
                    label="Check-in habilitado"
                    value={data.checkin_enabled ? 'Sí' : 'No'}
                  />
                  <Row
                    label="Voz TTS configurada"
                    value={data.tts_enabled ? 'Sí' : 'No'}
                  />
                </Section>
              )}
            </div>
          ) : null}
        </div>

        <footer
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--ink-200)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: 'var(--ink-600)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
          {data && (
            <button
              type="button"
              onClick={() => navigate(`/admin/users/${data.id}`)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--mabel-600)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-brand)',
              }}
            >
              Ver ficha completa
            </button>
          )}
        </footer>
      </aside>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--ink-500)',
          margin: '0 0 8px',
        }}
      >
        {title}
      </h3>
      <div
        style={{
          border: '1px solid var(--ink-200)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 12px',
        borderBottom: '1px solid var(--ink-100)',
        fontSize: 12.5,
      }}
      className="last:border-b-0"
    >
      <span style={{ color: 'var(--ink-500)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: 'var(--ink-900)',
          fontWeight: 500,
          textAlign: 'right',
          fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
          fontSize: mono ? 11.5 : 12.5,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}
