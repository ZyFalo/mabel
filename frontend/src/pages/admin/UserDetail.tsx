import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import BulkActionModal from '../../components/admin/BulkActionModal'
import DisableUserModal from '../../components/admin/DisableUserModal'
import EnableUserModal from '../../components/admin/EnableUserModal'
import { useToastStore } from '../../stores/toastStore'

// Backend (UserAdminDetail) returns a FLAT shape. We adapt these into the
// nested groupings the UI renders.
interface UserAdminDetailRaw {
  id: string
  email_masked: string
  display_name: string | null
  role: string
  cohort: string | null
  created_at: string
  disabled_at: string | null
  disabled_reason: string | null
  consent_status: string | null
  consent_version: string | null
  consent_scope?: string | null
  consent_accepted_at: string | null
  consent_revoked_at: string | null
  save_history: boolean | null
  checkin_enabled?: boolean | null
  tts_enabled: boolean | null
  asr_enabled: boolean | null
  voice: string | null
  notifications_email: string | null
  total_sessions: number
  total_messages: number
  last_session_at: string | null
  total_reports_filed: number
  total_safety_events: number
}

interface UserAdminDetail {
  id: string
  email_masked: string
  display_name: string | null
  role: string
  cohort: string | null
  created_at: string
  disabled_at: string | null
  disabled_reason: string | null
  consent: {
    version: string | null
    scope: string | null
    accepted_at: string | null
    revoked_at: string | null
  } | null
  preferences: {
    save_history: boolean
    checkin_enabled: boolean
    has_tts_voice: boolean
    accessibility_keys: string[]
  } | null
  statistics: {
    total_sessions: number
    last_session_at: string | null
    avg_messages_per_session: number | null
    total_reports: number
    total_safety_events: number
  }
}

function adaptUserDetail(raw: UserAdminDetailRaw): UserAdminDetail {
  const avg =
    raw.total_sessions > 0 ? raw.total_messages / raw.total_sessions : null
  const accessibility_keys: string[] = []
  if (raw.tts_enabled) accessibility_keys.push('tts')
  if (raw.asr_enabled) accessibility_keys.push('asr')
  if (raw.voice) accessibility_keys.push(`voz:${raw.voice}`)
  return {
    id: raw.id,
    email_masked: raw.email_masked,
    display_name: raw.display_name,
    role: raw.role,
    cohort: raw.cohort,
    created_at: raw.created_at,
    disabled_at: raw.disabled_at,
    disabled_reason: raw.disabled_reason,
    consent: raw.consent_status
      ? {
          version: raw.consent_version,
          scope: raw.consent_scope ?? null,
          accepted_at: raw.consent_accepted_at,
          revoked_at: raw.consent_revoked_at,
        }
      : null,
    preferences: {
      save_history: raw.save_history ?? false,
      checkin_enabled: raw.checkin_enabled ?? true,
      has_tts_voice: !!raw.tts_enabled,
      accessibility_keys,
    },
    statistics: {
      total_sessions: raw.total_sessions,
      last_session_at: raw.last_session_at,
      avg_messages_per_session: avg,
      total_reports: raw.total_reports_filed,
      total_safety_events: raw.total_safety_events,
    },
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

function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatScope(scope: string | null): string {
  if (!scope) return '—'
  // Accept either array, comma-separated, or single value
  const items = scope
    .replace(/^\[|\]$/g, '')
    .split(/[,\s]+/)
    .map((s) => s.trim().replace(/['"]/g, ''))
    .filter(Boolean)
  if (items.length === 0) return scope
  return items.join(', ')
}

// ---------- Atoms ----------

function Card({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <header className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-primary/40">
              {eyebrow}
            </p>
          )}
          <h2 className="text-base font-semibold text-text-primary mt-0.5">{title}</h2>
        </div>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-0.5">
        {label}
      </p>
      <div className="text-sm text-text-primary break-words">{children}</div>
    </div>
  )
}

function FlagChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        on
          ? 'bg-success/8 text-success border-success/25'
          : 'bg-gray-100 text-text-primary/45 border-gray-200',
      ].join(' ')}
    >
      <span
        className={[
          'w-1.5 h-1.5 rounded-full',
          on ? 'bg-success' : 'bg-text-primary/30',
        ].join(' ')}
      />
      {label}
      <span className="opacity-60 text-[10px] uppercase tracking-wider ml-0.5">
        {on ? 'ON' : 'OFF'}
      </span>
    </span>
  )
}

function StatBlock({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45">
        {label}
      </p>
      <p className="text-2xl font-semibold text-text-primary mt-1 tabular-nums leading-none">
        {value}
      </p>
      {hint && <p className="text-[11px] text-text-primary/50 mt-1.5">{hint}</p>}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === 'admin'
  const style: React.CSSProperties = isAdmin
    ? {
        background: 'var(--mabel-50)',
        color: 'var(--mabel-700)',
        borderColor: 'var(--mabel-200)',
      }
    : {
        background: 'var(--info-50)',
        color: 'var(--info-600)',
        borderColor: 'rgba(37, 99, 235, 0.25)',
      }
  return (
    <span
      className="inline-flex items-center"
      style={{
        padding: '3px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        border: '1px solid',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {isAdmin ? 'Administrador' : 'Estudiante'}
    </span>
  )
}

function StatusPill({ disabled }: { disabled: boolean }) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-danger/10 text-danger border-danger/30">
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
        Deshabilitada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-success/10 text-success border-success/30">
      <span className="w-1.5 h-1.5 rounded-full bg-success" />
      Activa
    </span>
  )
}

// ---------- Cohort Editor ----------

function CohortEditor({
  userId,
  currentCohort,
  isAdminUser,
  onChanged,
}: {
  userId: string
  currentCohort: string | null
  isAdminUser: boolean
  onChanged: () => void
}) {
  const addToast = useToastStore((s) => s.addToast)
  const [value, setValue] = useState(currentCohort ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(currentCohort ?? '')
  }, [currentCohort])

  const trimmed = value.trim()
  const dirty = trimmed !== (currentCohort ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      await apiClient.patch(`/admin/users/${userId}/cohort`, {
        cohort: trimmed.length > 0 ? trimmed : null,
      })
      addToast({ type: 'success', message: 'Cohorte actualizada.' })
      onChanged()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo actualizar la cohorte.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    try {
      await apiClient.patch(`/admin/users/${userId}/cohort`, { cohort: null })
      addToast({ type: 'success', message: 'Cohorte eliminada.' })
      setValue('')
      onChanged()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo eliminar la cohorte.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="col-span-2 border-t border-gray-100 pt-4 mt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-1.5">
        Cohorte de estudio
      </p>
      {isAdminUser && (
        <p className="text-[11px] text-warning/90 mb-2">
          Los administradores normalmente no requieren cohorte asignada.
        </p>
      )}
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="piloto-fase1"
          disabled={saving}
          className="flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar cohorte'}
        </button>
        {currentCohort && (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-danger/30 text-danger hover:bg-danger/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Eliminar cohorte
          </button>
        )}
      </div>
      <p className="text-[11px] text-text-primary/50 mt-1.5">
        Asigna una cohorte para filtrar métricas del estudio cuasiexperimental.
      </p>
    </div>
  )
}

// ---------- Page ----------

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [user, setUser] = useState<UserAdminDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)
  const [enableOpen, setEnableOpen] = useState(false)
  // Re-uses BulkActionModal in single-user mode for the hard-delete flow.
  // The modal already handles the "CONFIRMAR" gate and shows a clear
  // impact summary; passing a one-element array keeps the same UX path.
  const [deleteOpen, setDeleteOpen] = useState(false)

  const fetchUser = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiClient.get<UserAdminDetailRaw>(`/admin/users/${id}`)
      setUser(adaptUserDetail(res.data))
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } }
      if (e?.response?.status === 404) {
        setErrorMsg('No se encontro el usuario solicitado.')
      } else {
        setErrorMsg(e?.response?.data?.detail ?? 'No se pudo cargar el detalle del usuario.')
      }
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const isDisabled = !!user?.disabled_at
  const isAdminRole = user?.role === 'admin'
  const canDisable = !!user && !isDisabled && !isAdminRole

  const heroInitials = (() => {
    const src = (user?.display_name || user?.email_masked || 'U').trim()
    const parts = src.split(/[\s.@]+/).slice(0, 2)
    return (parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'U').slice(0, 2)
  })()

  return (
    <div
      className="fade-in"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Breadcrumb */}
      <div style={{ padding: '20px 32px 0' }}>
        <nav aria-label="Migas de pan">
          <Link
            to="/admin/users"
            className="inline-flex items-center"
            style={{
              gap: 4,
              fontSize: 12.5,
              color: 'var(--ink-500)',
              textDecoration: 'none',
              transition: 'color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--mabel-700)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ink-500)')}
          >
            <span aria-hidden>‹</span>
            <span>Volver a usuarios</span>
          </Link>
        </nav>
      </div>

      {/* Hero band */}
      <section
        style={{
          background: 'var(--mabel-50)',
          borderBottom: '1px solid var(--ink-200)',
          padding: '24px 32px',
          marginTop: 16,
        }}
      >
        <div
          style={{ maxWidth: 1200, margin: '0 auto' }}
          className="flex items-start justify-between flex-wrap gap-4"
        >
          <div className="flex items-start" style={{ gap: 18, minWidth: 0 }}>
            <span
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--mabel-100)',
                color: 'var(--mabel-700)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                flexShrink: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {heroInitials}
            </span>
            <div className="min-w-0">
              <p
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  color: 'var(--mabel-700)',
                  opacity: 0.85,
                  margin: 0,
                }}
              >
                Detalle de usuario
              </p>
              <h1
                className="truncate"
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: 'var(--ink-900)',
                  marginTop: 4,
                  marginBottom: 0,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                {user?.email_masked || user?.display_name || 'Cargando…'}
              </h1>
              <div
                className="flex items-center flex-wrap"
                style={{ gap: 8, marginTop: 10 }}
              >
                {user && <RoleBadge role={user.role} />}
                {user && <StatusPill disabled={isDisabled} />}
                {user && (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-500)',
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    ID: {user.id.slice(0, 8)}…
                  </span>
                )}
              </div>
            </div>
          </div>

          {canDisable && (
            <button
              type="button"
              onClick={() => setDisableOpen(true)}
              className="inline-flex items-center"
              style={{
                gap: 8,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--white)',
                background: 'var(--danger-600)',
                borderRadius: 9999,
                border: '1px solid var(--danger-600)',
                cursor: 'pointer',
                transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-700)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--ring-danger)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-600)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              Deshabilitar cuenta
            </button>
          )}

          {/* Disabled-only actions: reactivar + eliminar permanentemente.
              Admins quedan fuera (no se pueden deshabilitar para empezar,
              así que tampoco caen aquí). */}
          {user && isDisabled && !isAdminRole && (
            <div className="flex items-center" style={{ gap: 8 }}>
              <button
                type="button"
                onClick={() => setEnableOpen(true)}
                className="inline-flex items-center"
                style={{
                  gap: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--white)',
                  background: 'var(--success-600)',
                  borderRadius: 9999,
                  border: '1px solid var(--success-600)',
                  cursor: 'pointer',
                  transition:
                    'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--success-700)'
                  ;(e.currentTarget as HTMLElement).style.boxShadow =
                    '0 0 0 4px rgba(5, 150, 105, 0.18)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--success-600)'
                  ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
                }}
              >
                Reactivar cuenta
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center"
                style={{
                  gap: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--danger-700)',
                  background: 'transparent',
                  borderRadius: 9999,
                  border: '1px solid var(--danger-300, rgba(220, 38, 38, 0.35))',
                  cursor: 'pointer',
                  transition:
                    'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--danger-50)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                Eliminar permanentemente
              </button>
            </div>
          )}
        </div>
      </section>

      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            marginBottom: 20,
            border: '1px solid var(--danger-200)',
            background: 'var(--danger-50)',
            borderRadius: 'var(--r-lg)',
            padding: '12px 16px',
            fontSize: 13,
            color: 'var(--danger-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchUser}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--danger-700)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !user && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-xl bg-white p-5 animate-pulse h-48"
            >
              <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
              <div className="h-4 w-1/2 bg-gray-200 rounded mb-6" />
              <div className="space-y-2">
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
                <div className="h-3 w-2/3 bg-gray-100 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Información general */}
          <Card title="Información general" eyebrow="Identidad">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Email">
                <span className="font-mono text-[13px]">{user.email_masked}</span>
              </Field>
              <Field label="Nombre">{user.display_name || '—'}</Field>
              <Field label="Rol">
                <RoleBadge role={user.role} />
              </Field>
              <Field label="Registro">{formatDate(user.created_at)}</Field>
              <Field label="Estado">
                <StatusPill disabled={isDisabled} />
              </Field>
              <Field label="Deshabilitada el">
                {isDisabled ? formatDateTime(user.disabled_at) : '—'}
              </Field>
              <Field label="Cohorte actual">
                {user.cohort ? (
                  <span
                    className="inline-flex items-center"
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'var(--ink-100)',
                      color: 'var(--ink-700)',
                      border: '1px solid var(--ink-200)',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}
                  >
                    {user.cohort}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--ink-400)', fontStyle: 'italic' }}>
                    Sin cohorte
                  </span>
                )}
              </Field>
              <Field label="ID">
                <span className="font-mono text-[11px] text-text-primary/60">
                  {user.id.slice(0, 8)}…
                </span>
              </Field>
              {user.disabled_reason && (
                <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                  <Field label="Razón de la deshabilitación">
                    <p className="text-sm text-text-primary/80 leading-relaxed">
                      {user.disabled_reason}
                    </p>
                  </Field>
                </div>
              )}
              <CohortEditor
                userId={user.id}
                currentCohort={user.cohort}
                isAdminUser={isAdminRole}
                onChanged={fetchUser}
              />
            </dl>
          </Card>

          {/* 2. Consentimiento */}
          <Card title="Consentimiento informado" eyebrow="Legal">
            {user.consent ? (
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Version">
                  <span className="font-mono text-[13px]">{user.consent.version || '—'}</span>
                </Field>
                <Field label="Alcance">{formatScope(user.consent.scope)}</Field>
                <Field label="Aceptado el">{formatDateTime(user.consent.accepted_at)}</Field>
                <Field label="Revocado el">
                  {user.consent.revoked_at ? (
                    <span className="text-danger">{formatDateTime(user.consent.revoked_at)}</span>
                  ) : (
                    '—'
                  )}
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-text-primary/50 italic">
                Sin consentimiento registrado.
              </p>
            )}
          </Card>

          {/* 3. Preferencias */}
          <Card title="Preferencias" eyebrow="Configuracion del usuario">
            {user.preferences ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <FlagChip label="Historial" on={user.preferences.save_history} />
                  <FlagChip label="Check-in" on={user.preferences.checkin_enabled} />
                  <FlagChip label="Voz TTS" on={user.preferences.has_tts_voice} />
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/45 mb-2">
                    Accesibilidad activada
                  </p>
                  {user.preferences.accessibility_keys.length === 0 ? (
                    <p className="text-sm text-text-primary/50 italic">
                      Sin ajustes de accesibilidad.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {user.preferences.accessibility_keys.map((key) => (
                        <li
                          key={key}
                          className="inline-flex items-center"
                          style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--ink-100)',
                            color: 'var(--ink-700)',
                            border: '1px solid var(--ink-200)',
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          {key}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-primary/50 italic">
                Sin preferencias configuradas.
              </p>
            )}
          </Card>

          {/* 4. Estadisticas */}
          <Card title="Estadisticas de uso" eyebrow="Actividad">
            <div className="grid grid-cols-2 gap-3">
              <StatBlock
                label="Sesiones totales"
                value={formatNumber(user.statistics.total_sessions)}
              />
              <StatBlock
                label="Mensajes / sesión"
                value={formatNumber(user.statistics.avg_messages_per_session, 1)}
                hint="Promedio"
              />
              <StatBlock
                label="Reportes emitidos"
                value={formatNumber(user.statistics.total_reports)}
              />
              <StatBlock
                label="Safety events"
                value={formatNumber(user.statistics.total_safety_events)}
              />
              <div className="col-span-2">
                <StatBlock
                  label="Última sesión"
                  value={
                    <span className="text-base font-medium">
                      {formatDateTime(user.statistics.last_session_at)}
                    </span>
                  }
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Disable modal */}
      {user && (
        <DisableUserModal
          open={disableOpen}
          userId={user.id}
          onClose={() => setDisableOpen(false)}
          onDisabled={() => {
            setDisableOpen(false)
            navigate('/admin/users')
          }}
        />
      )}

      {/* Enable modal */}
      {user && enableOpen && (
        <EnableUserModal
          open={enableOpen}
          userId={user.id}
          userLabel={user.display_name?.trim() || user.email_masked}
          previousReason={user.disabled_reason}
          onClose={() => setEnableOpen(false)}
          onEnabled={() => {
            setEnableOpen(false)
            fetchUser()
          }}
        />
      )}

      {/* Delete (permanent) modal — reuses BulkActionModal with N=1 */}
      {user && deleteOpen && (
        <BulkActionModal
          open={deleteOpen}
          action="delete"
          selected={[
            {
              id: user.id,
              email_masked: user.email_masked,
              display_name: user.display_name,
              role: user.role,
              disabled_at: user.disabled_at,
            },
          ]}
          onClose={() => setDeleteOpen(false)}
          onApplied={(res) => {
            setDeleteOpen(false)
            if (res.applied > 0) {
              navigate('/admin/users')
            } else {
              fetchUser()
            }
          }}
        />
      )}
      </div>
    </div>
  )
}
