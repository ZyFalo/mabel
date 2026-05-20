import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import DisableUserModal from '../../components/admin/DisableUserModal'
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
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border tracking-wide',
        isAdmin
          ? 'bg-primary/8 text-primary border-primary/25'
          : 'bg-accent/8 text-accent border-accent/25',
      ].join(' ')}
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
        Asigna una cohorte para filtrar metricas del estudio cuasiexperimental.
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

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Breadcrumb / Back */}
      <nav className="mb-4 text-sm" aria-label="Migas de pan">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1.5 text-text-primary/60 hover:text-primary transition-colors"
        >
          <span aria-hidden="true">‹</span>
          Volver a usuarios
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            Detalle de usuario
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-text-primary truncate">
              {user?.display_name || user?.email_masked || 'Cargando…'}
            </h1>
            {user && <StatusPill disabled={isDisabled} />}
            {user && <RoleBadge role={user.role} />}
          </div>
          {user && (
            <p className="text-xs text-text-primary/50 mt-1 font-mono tracking-tight">
              ID: {user.id}
            </p>
          )}
        </div>

        {canDisable && (
          <button
            type="button"
            onClick={() => setDisableOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-danger border border-danger/30 rounded-lg hover:bg-danger/5 transition-colors"
          >
            Deshabilitar cuenta
          </button>
        )}
      </header>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-6 border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchUser}
            className="text-xs font-semibold underline hover:no-underline"
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
          {/* 1. Informacion general */}
          <Card title="Informacion general" eyebrow="Identidad">
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
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/8 text-accent border border-accent/20 text-xs font-mono font-medium">
                    {user.cohort}
                  </span>
                ) : (
                  <span className="text-text-primary/40 italic text-xs">Sin cohorte</span>
                )}
              </Field>
              <Field label="ID">
                <span className="font-mono text-[11px] text-text-primary/60">
                  {user.id.slice(0, 8)}…
                </span>
              </Field>
              {user.disabled_reason && (
                <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
                  <Field label="Razon de deshabilitacion">
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
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/8 text-accent border border-accent/15 text-xs font-medium"
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
                label="Mensajes / sesion"
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
                  label="Ultima sesion"
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
    </div>
  )
}
