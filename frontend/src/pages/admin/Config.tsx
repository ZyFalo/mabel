import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'
import { formatApiError } from '../../utils/apiError'
import { SEVERITY_LABELS } from '../../utils/severity'

// ============================================================================
// Types
// ============================================================================

interface SystemConfigItem {
  key: string
  value: unknown
  updated_at: string | null
}

interface HotlineEntry {
  name: string
  number: string
}

// Structured safety keyword. Mirrors the backend shape
// `list[{keyword: str, critical: bool}]`. Critical=true entries force
// severity 5 in the guardrails analyzer (auto-SOS); non-critical
// accumulate +1 each up to 4. Admin controls both kw AND the flag.
interface KeywordEntry {
  keyword: string
  critical: boolean
}

interface ConsentVersion {
  id: string
  version: string
  title: string
  body: string
  status: 'draft' | 'active' | 'archived'
  published_at?: string | null
  created_at?: string | null
}

interface GeminiTestResult {
  ok: boolean
  latency_ms: number
  model: string
  error?: string | null
}

// ============================================================================
// Helpers
// ============================================================================

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

function normalizeKeyword(raw: string): string {
  return raw.trim().toLowerCase()
}

function isValidPhoneNumber(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 12 && digits === num
}

function indexByKey(items: SystemConfigItem[]): Record<string, SystemConfigItem> {
  const out: Record<string, SystemConfigItem> = {}
  for (const it of items) out[it.key] = it
  return out
}

function asKeywordArray(value: unknown): KeywordEntry[] {
  // Backend currently writes the structured shape; legacy seed data
  // (plain string list) is also accepted for the migration window.
  if (!Array.isArray(value)) return []
  const out: KeywordEntry[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    let kw = ''
    let critical = false
    if (typeof entry === 'string') {
      kw = normalizeKeyword(entry)
    } else if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      if (typeof e.keyword === 'string') kw = normalizeKeyword(e.keyword)
      critical = Boolean(e.critical)
    }
    if (!kw || seen.has(kw)) continue
    seen.add(kw)
    out.push({ keyword: kw, critical })
  }
  return out
}

function asHotlineArray(value: unknown): HotlineEntry[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
      .map((v) => ({
        name: typeof v.name === 'string' ? v.name : '',
        number: typeof v.number === 'string' ? v.number : '',
      }))
  }
  return []
}

function asThreshold(value: unknown): number {
  const n = Number(value)
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n)
  return 3
}

function asGuardrailsEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return true
}

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return false
}

// ============================================================================
// Common section card
// ============================================================================

function SectionCard({
  index,
  title,
  description,
  children,
}: {
  index: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-[11px] font-semibold tracking-wider">
            {index}
          </span>
          <div>
            <h2 className="text-base font-semibold text-text-primary leading-tight">{title}</h2>
            {description && (
              <p className="text-[12px] text-text-primary/60 mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}

// Collapsible body viewer for a consent_version. Renders the legal text
// in a fixed-height scroll box so the admin can review what users
// actually accepted/will accept. Used in 3 places (active, draft,
// archived rows) inside the Consent section.
function VersionBodyToggle({
  version,
  isExpanded,
  onToggle,
}: {
  version: ConsentVersion
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-[12px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
        aria-expanded={isExpanded}
        aria-controls={`consent-body-${version.id}`}
      >
        <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
          ▶
        </span>
        {isExpanded ? 'Ocultar texto completo' : 'Ver texto completo'}
        <span className="text-text-primary/40 font-normal">
          ({version.body.length.toLocaleString('es-CO')} caracteres)
        </span>
      </button>
      {isExpanded && (
        <div
          id={`consent-body-${version.id}`}
          className="mt-2 border border-gray-200 rounded-md bg-white overflow-hidden"
        >
          <div
            className="overflow-y-auto p-3 text-[12.5px] font-mono leading-relaxed whitespace-pre-wrap text-text-primary/85"
            style={{ maxHeight: 280 }}
          >
            {version.body}
          </div>
        </div>
      )}
    </div>
  )
}

function SaveButton({
  onClick,
  loading,
  disabled,
  label = 'Guardar cambios',
}: {
  onClick: () => void
  loading: boolean
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? 'Guardando...' : label}
    </button>
  )
}

// ============================================================================
// Section 1 — Consentimiento
// ============================================================================

function ConsentSection() {
  const addToast = useToastStore((s) => s.addToast)
  const [active, setActive] = useState<ConsentVersion | null>(null)
  const [draft, setDraft] = useState<ConsentVersion | null>(null)
  const [archived, setArchived] = useState<ConsentVersion[]>([])
  const [loading, setLoading] = useState(true)

  // UI state: which version's body is expanded (collapsible "Ver texto").
  // Single string instead of a Set because we only show one expanded
  // at a time (compact layout); switching auto-collapses the previous.
  const [expandedBodyId, setExpandedBodyId] = useState<string | null>(null)

  const [form, setForm] = useState({ version: '', title: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmPublishId, setConfirmPublishId] = useState<string | null>(null)
  // Two-step confirmation for delete (same UX pattern as publish):
  // first click sets confirmDeleteId, second click actually deletes.
  // Prevents accidental wipes of draft work.
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      // `GET /admin/consent-versions` returns the full list (active +
      // drafts + archived) WITH the body text — see
      // `config_router.py:138`. The response is a bare array
      // (`list[ConsentVersionItem]`), not wrapped. We accept either
      // shape defensively so a future refactor that adds an `items`
      // wrapper doesn't crash this UI.
      const res = await apiClient.get<ConsentVersion[] | { items: ConsentVersion[] }>(
        '/admin/consent-versions',
      )
      const data = res.data
      const items: ConsentVersion[] = Array.isArray(data) ? data : (data?.items ?? [])

      setActive(items.find((v) => v.status === 'active') ?? null)
      setDraft(items.find((v) => v.status === 'draft') ?? null)
      setArchived(items.filter((v) => v.status === 'archived'))
    } catch {
      // Endpoint failure (e.g. no admin role) — fall back to the public
      // active version so the admin at least sees the current document
      // body even if they can't list history.
      try {
        const res = await apiClient.get<ConsentVersion>('/consent-versions/active')
        setActive(res.data ?? null)
      } catch {
        setActive(null)
      }
      setDraft(null)
      setArchived([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVersions()
  }, [loadVersions])

  async function handleCreateDraft() {
    if (!form.version.trim() || !form.title.trim() || !form.body.trim()) {
      addToast({
        type: 'warning',
        message: 'Completa versión, título y contenido antes de crear el borrador.',
      })
      return
    }
    setSubmitting(true)
    try {
      const res = await apiClient.post<ConsentVersion>('/admin/consent-versions', {
        version: form.version.trim(),
        title: form.title.trim(),
        body: form.body,
      })
      setDraft(res.data ?? null)
      setForm({ version: '', title: '', body: '' })
      addToast({ type: 'success', message: 'Borrador de consentimiento creado.' })
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo crear el borrador.'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePublish(id: string) {
    setPublishing(true)
    try {
      await apiClient.post(`/admin/consent-versions/${id}/publish`)
      addToast({ type: 'success', message: 'Versión publicada como activa.' })
      setConfirmPublishId(null)
      await loadVersions()
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo publicar la versión.'),
      })
    } finally {
      setPublishing(false)
    }
  }

  async function handleDeleteDraft(id: string) {
    setDeleting(true)
    try {
      await apiClient.delete(`/admin/consent-versions/${id}`)
      addToast({ type: 'success', message: 'Borrador eliminado.' })
      setConfirmDeleteId(null)
      await loadVersions()
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo eliminar el borrador.'),
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <SectionCard
      index="01"
      title="Consentimiento informado"
      description="Gestiona la versión activa del documento legal y publica nuevas versiones."
    >
      {loading ? (
        <p className="text-sm text-text-primary/50">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Active version */}
          <div className="border border-gray-200 rounded-md p-4 bg-gray-50/40">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
              Version activa
            </p>
            {active ? (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-sm font-semibold text-text-primary">
                  v{active.version} — {active.title}
                </p>
                <p className="text-[12px] text-text-primary/60">
                  Publicada: {formatDateTime(active.published_at ?? active.created_at)}
                </p>
                <VersionBodyToggle
                  version={active}
                  isExpanded={expandedBodyId === active.id}
                  onToggle={() =>
                    setExpandedBodyId((prev) => (prev === active.id ? null : active.id))
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-text-primary/60 italic mt-2">
                Sin versión activa registrada.
              </p>
            )}
          </div>

          {/* Pending draft */}
          {draft && (
            <div className="border border-warning/40 bg-warning/5 rounded-md p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warning">
                Borrador pendiente
              </p>
              <p className="text-sm font-semibold text-text-primary mt-2">
                v{draft.version} — {draft.title}
              </p>
              <p className="text-[12px] text-text-primary/60 mt-0.5">
                Creado: {formatDateTime(draft.created_at)}
              </p>
              <VersionBodyToggle
                version={draft}
                isExpanded={expandedBodyId === draft.id}
                onToggle={() =>
                  setExpandedBodyId((prev) => (prev === draft.id ? null : draft.id))
                }
              />
              <div className="mt-3 border-t border-warning/20 pt-3">
                <p className="text-[12px] text-text-primary/80">
                  Al publicar, todos los usuarios deberán re-aceptar el consentimiento informado.
                </p>

                {/* Action area: publish + delete coexist. The publish
                    button is primary (warning color = "esto afecta a
                    todos los usuarios"), delete is secondary (danger
                    color, ghost style = "menos prominente, pero
                    disponible"). Both use the two-step confirm pattern
                    so a misclick on either doesn't trigger the
                    destructive op. They share state machine: only ONE
                    of confirmPublishId / confirmDeleteId can be set
                    for a given draft at a time. Clicking either
                    confirm cancels the other. */}
                {confirmPublishId === draft.id ? (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmPublishId(null)}
                      className="text-xs text-text-primary/70 hover:text-text-primary px-3 py-1.5"
                      disabled={publishing}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePublish(draft.id)}
                      disabled={publishing}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-warning text-white hover:bg-warning/90 disabled:opacity-60 transition-colors"
                    >
                      {publishing ? 'Publicando...' : 'Confirmar publicación'}
                    </button>
                  </div>
                ) : confirmDeleteId === draft.id ? (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-text-primary/70 hover:text-text-primary px-3 py-1.5"
                      disabled={deleting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.id)}
                      disabled={deleting}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-danger text-white hover:bg-danger/90 disabled:opacity-60 transition-colors"
                    >
                      {deleting ? 'Eliminando...' : 'Confirmar eliminación'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(null)
                        setConfirmPublishId(draft.id)
                      }}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-warning text-white hover:bg-warning/90 transition-colors"
                    >
                      Publicar versión
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPublishId(null)
                        setConfirmDeleteId(draft.id)
                      }}
                      className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold border border-danger/40 text-danger bg-white hover:bg-danger/5 transition-colors"
                    >
                      Eliminar borrador
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Archived versions — legal history. Each row shows metadata
              + collapsible body so the admin can audit what text was in
              force at any point in time. */}
          {archived.length > 0 && (
            <details className="border border-gray-200 rounded-md bg-white/40">
              <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-text-primary/60 hover:bg-gray-50">
                Versiones archivadas ({archived.length})
              </summary>
              <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-gray-100">
                {archived.map((v) => (
                  <div
                    key={v.id}
                    className="border border-gray-200 rounded-md p-3 bg-gray-50/30"
                  >
                    <p className="text-sm font-semibold text-text-primary">
                      v{v.version} — {v.title}
                    </p>
                    <p className="text-[12px] text-text-primary/60 mt-0.5">
                      Publicada: {formatDateTime(v.published_at)} · Archivada al
                      publicarse una nueva versión
                    </p>
                    <VersionBodyToggle
                      version={v}
                      isExpanded={expandedBodyId === v.id}
                      onToggle={() =>
                        setExpandedBodyId((prev) => (prev === v.id ? null : v.id))
                      }
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* New version form */}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60">
              Crear nueva versión
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="cv-version"
                  className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60"
                >
                  Version
                </label>
                <input
                  id="cv-version"
                  type="text"
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="2.0"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="cv-title"
                  className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60"
                >
                  Titulo
                </label>
                <input
                  id="cv-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Consentimiento informado v2.0"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="cv-body"
                className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60"
              >
                Contenido legal
              </label>
              <textarea
                id="cv-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={12}
                placeholder="Texto completo del consentimiento informado..."
                className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y font-mono leading-relaxed"
              />
              <p className="text-[11px] text-text-primary/50">
                Acepta texto plano. Sera mostrado tal cual en la pantalla de aceptacion.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <SaveButton
                onClick={handleCreateDraft}
                loading={submitting}
                label="Crear borrador"
              />
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ============================================================================
// Section 2 — Guardrails
// ============================================================================

// ----- Study lock override modal -----

function OverrideConfirmModal({
  open,
  onConfirm,
  onCancel,
  pending,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  pending: boolean
}) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1l7 13H1L8 1z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 6v3.5M8 11.5h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <h3
            id="override-title"
            className="text-base font-semibold text-text-primary leading-tight"
          >
            Override del bloqueo de estudio
          </h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-text-primary/80 leading-relaxed">
            El bloqueo de estudio esta activo. ¿Confirmas override?
          </p>
          <p className="text-[12px] text-text-primary/55 mt-2 leading-relaxed">
            Todas las acciones quedan registradas en el audit log con la marca de override.
          </p>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-sm font-medium text-text-primary/70 hover:text-text-primary disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center px-3.5 py-1.5 rounded-md text-sm font-semibold bg-warning text-white hover:bg-warning/90 disabled:opacity-50"
          >
            {pending ? 'Aplicando…' : 'Confirmar override'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GuardrailsSection({
  initialKeywords,
  initialThreshold,
  initialEnabled,
  initialStudyLock,
  onChanged,
}: {
  initialKeywords: KeywordEntry[]
  initialThreshold: number
  initialEnabled: boolean
  initialStudyLock: boolean
  onChanged: () => void
}) {
  const addToast = useToastStore((s) => s.addToast)

  // Study lock
  const [studyLock, setStudyLock] = useState<boolean>(initialStudyLock)
  const [savingLock, setSavingLock] = useState(false)
  useEffect(() => setStudyLock(initialStudyLock), [initialStudyLock])

  // Override modal state
  const [pendingOverride, setPendingOverride] = useState<null | (() => Promise<void>)>(null)
  const [overrideRunning, setOverrideRunning] = useState(false)

  // Keywords (structured: each entry carries its `critical` flag)
  const [keywords, setKeywords] = useState<KeywordEntry[]>(initialKeywords)
  const [newKeyword, setNewKeyword] = useState('')
  // New entries default to non-critical. The admin can toggle the
  // newly-added chip's flag after creation. A "Crítica" pre-add toggle
  // lives next to the Agregar button.
  const [newKeywordCritical, setNewKeywordCritical] = useState(false)
  const [savingKeywords, setSavingKeywords] = useState(false)

  // Threshold
  const [threshold, setThreshold] = useState<number>(initialThreshold)
  const [savingThreshold, setSavingThreshold] = useState(false)

  // Enabled
  const [enabled, setEnabled] = useState<boolean>(initialEnabled)
  const [savingEnabled, setSavingEnabled] = useState(false)

  useEffect(() => setKeywords(initialKeywords), [initialKeywords])
  useEffect(() => setThreshold(initialThreshold), [initialThreshold])
  useEffect(() => setEnabled(initialEnabled), [initialEnabled])

  const keywordsDirty = useMemo(
    () =>
      keywords.length !== initialKeywords.length ||
      keywords.some(
        (k, i) =>
          k.keyword !== initialKeywords[i]?.keyword ||
          k.critical !== initialKeywords[i]?.critical,
      ),
    [keywords, initialKeywords],
  )
  const thresholdDirty = threshold !== initialThreshold
  const enabledDirty = enabled !== initialEnabled

  async function saveStudyLock() {
    setSavingLock(true)
    try {
      await apiClient.patch('/admin/config/study_lock_enabled', { value: studyLock })
      addToast({
        type: 'success',
        message: studyLock
          ? 'Bloqueo de estudio activado.'
          : 'Bloqueo de estudio desactivado.',
      })
      onChanged()
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo actualizar el bloqueo de estudio.'),
      })
    } finally {
      setSavingLock(false)
    }
  }

  const studyLockDirty = studyLock !== initialStudyLock

  // Wraps a PATCH call: if the lock is on, prompt the override modal first.
  function guardedSave(performPatch: (override: boolean) => Promise<void>) {
    if (!studyLock) {
      // No lock — just run
      return performPatch(false)
    }
    // Lock on — open modal
    setPendingOverride(() => async () => {
      setOverrideRunning(true)
      try {
        await performPatch(true)
        setPendingOverride(null)
      } finally {
        setOverrideRunning(false)
      }
    })
    return Promise.resolve()
  }

  function handleLockedError(err: unknown, fallback: string) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 423) {
      addToast({
        type: 'error',
        message: 'Bloqueo de estudio activo: usa override explicito para modificar guardrails.',
      })
    } else {
      addToast({
        type: 'error',
        message: formatApiError(err, fallback),
      })
    }
  }

  function addKeyword() {
    const v = normalizeKeyword(newKeyword)
    if (!v) return
    if (keywords.some((k) => k.keyword === v)) {
      addToast({ type: 'warning', message: `"${v}" ya esta en la lista.` })
      return
    }
    setKeywords((prev) => [...prev, { keyword: v, critical: newKeywordCritical }])
    setNewKeyword('')
    setNewKeywordCritical(false)
  }

  function removeKeyword(kw: string) {
    setKeywords((prev) => prev.filter((k) => k.keyword !== kw))
  }

  function toggleKeywordCritical(kw: string) {
    setKeywords((prev) =>
      prev.map((k) => (k.keyword === kw ? { ...k, critical: !k.critical } : k)),
    )
  }

  async function patchKeywords(override: boolean) {
    setSavingKeywords(true)
    try {
      await apiClient.patch(
        '/admin/config/safety_keywords',
        { value: keywords },
        override ? { headers: { 'X-Study-Lock-Override': 'true' } } : undefined,
      )
      addToast({ type: 'success', message: 'Lista de palabras clave actualizada.' })
      onChanged()
    } catch (err) {
      handleLockedError(err, 'No se pudo actualizar las palabras clave.')
    } finally {
      setSavingKeywords(false)
    }
  }
  function saveKeywords() {
    return guardedSave(patchKeywords)
  }

  async function patchThreshold(override: boolean) {
    setSavingThreshold(true)
    try {
      await apiClient.patch(
        '/admin/config/sos_severity_threshold',
        { value: threshold },
        override ? { headers: { 'X-Study-Lock-Override': 'true' } } : undefined,
      )
      addToast({ type: 'success', message: 'Umbral de severidad actualizado.' })
      onChanged()
    } catch (err) {
      handleLockedError(err, 'No se pudo actualizar el umbral.')
    } finally {
      setSavingThreshold(false)
    }
  }
  function saveThreshold() {
    return guardedSave(patchThreshold)
  }

  async function patchEnabled(override: boolean) {
    setSavingEnabled(true)
    try {
      await apiClient.patch(
        '/admin/config/guardrails_enabled',
        { value: enabled },
        override ? { headers: { 'X-Study-Lock-Override': 'true' } } : undefined,
      )
      addToast({
        type: 'success',
        message: enabled ? 'Guardrails activados.' : 'Guardrails desactivados.',
      })
      onChanged()
    } catch (err) {
      handleLockedError(err, 'No se pudo actualizar el estado de guardrails.')
    } finally {
      setSavingEnabled(false)
    }
  }
  function saveEnabled() {
    return guardedSave(patchEnabled)
  }

  const lockedClass = studyLock
    ? 'opacity-60 pointer-events-none select-none'
    : ''

  return (
    <SectionCard
      index="02"
      title="Guardrails de seguridad"
      description="Palabras clave para deteccion, umbral de severidad y activacion global del filtro."
    >
      <div className="flex flex-col gap-6">
        {/* Study lock sub-section */}
        <div className="border border-warning/30 bg-warning/5 rounded-md p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-warning/15 text-warning flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <rect
                      x="2.5"
                      y="5"
                      width="7"
                      height="5"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4 5V3.5a2 2 0 0 1 4 0V5"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-text-primary">
                  Bloqueo de configuración para estudio
                </p>
              </div>
              <p className="text-[12px] text-text-primary/65 mt-1 max-w-[520px]">
                Al activar este bloqueo, los cambios en palabras clave, umbral de severidad y
                activacion de guardrails requieren un override explicito durante la fase de
                estudio cuasiexperimental.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setStudyLock((v) => !v)}
                role="switch"
                aria-checked={studyLock}
                className={[
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-warning/30',
                  studyLock ? 'bg-warning' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                    studyLock ? 'translate-x-5' : 'translate-x-0.5',
                  ].join(' ')}
                />
              </button>
              <SaveButton
                onClick={saveStudyLock}
                loading={savingLock}
                disabled={!studyLockDirty}
                label="Aplicar"
              />
            </div>
          </div>

          {studyLock && (
            <div className="mt-3 pt-3 border-t border-warning/20 flex items-start gap-2">
              <span className="text-warning shrink-0 mt-0.5" aria-hidden="true">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1l7 13H1L8 1z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 6v3.5M8 11.5h.01"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <p className="text-[12px] text-warning leading-relaxed">
                <strong className="font-semibold">Bloqueo activo:</strong> los cambios a
                guardrails requieren override explicito y quedan registrados en el audit log.
              </p>
            </div>
          )}
        </div>

        {/* Toggle enabled */}
        <div
          className={[
            'flex items-center justify-between gap-4 border-b border-gray-100 pb-5',
            lockedClass,
          ].join(' ')}
          aria-disabled={studyLock}
        >
          <div>
            <p className="text-sm font-semibold text-text-primary">Filtro de guardrails activo</p>
            <p className="text-[12px] text-text-primary/60 mt-0.5">
              Si se desactiva, las respuestas no seran filtradas. Solo deshabilitar para
              diagnostico.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              role="switch"
              aria-checked={enabled}
              disabled={studyLock}
              className={[
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30',
                enabled ? 'bg-success' : 'bg-gray-300',
                studyLock ? 'cursor-not-allowed' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  enabled ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')}
              />
            </button>
            <SaveButton
              onClick={saveEnabled}
              loading={savingEnabled}
              disabled={!enabledDirty}
              label="Aplicar"
            />
          </div>
        </div>

        {/* Severity threshold */}
        <div className={['border-b border-gray-100 pb-5', lockedClass].join(' ')}
          aria-disabled={studyLock}
        >
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Umbral de severidad para activar SOS
              </p>
              <p className="text-[12px] text-text-primary/60 mt-0.5">
                Eventos con severidad mayor o igual a este valor disparan derivación SOS
                automática.
              </p>
            </div>
            <span className="text-3xl font-semibold tabular-nums text-primary leading-none">
              {threshold}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            disabled={studyLock}
            className={[
              'w-full accent-primary',
              studyLock ? 'cursor-not-allowed' : '',
            ].join(' ')}
            aria-label="Umbral de severidad"
          />
          <div className="flex items-center justify-between text-[11px] text-text-primary/50 mt-1 tabular-nums">
            <span>1 — {SEVERITY_LABELS[1].toLowerCase()}</span>
            <span>2 — {SEVERITY_LABELS[2].toLowerCase()}</span>
            <span>3 — {SEVERITY_LABELS[3].toLowerCase()}</span>
            <span>4 — {SEVERITY_LABELS[4].toLowerCase()}</span>
            <span>5 — {SEVERITY_LABELS[5].toLowerCase()}</span>
          </div>
          <div className="flex items-center justify-end mt-4">
            <SaveButton
              onClick={saveThreshold}
              loading={savingThreshold}
              disabled={!thresholdDirty}
              label="Aplicar umbral"
            />
          </div>
        </div>

        {/* Keywords */}
        <div className={lockedClass} aria-disabled={studyLock}>
          <p className="text-sm font-semibold text-text-primary">Palabras clave de seguridad</p>
          <p className="text-[12px] text-text-primary/60 mt-0.5">
            Lista de términos que activan revisión manual o filtros de respuesta.
            Marca como <span className="font-semibold text-danger">crítica</span> a las
            palabras que deben disparar el panel SOS automáticamente sin importar el
            umbral (ej. ideación suicida).
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              disabled={studyLock}
              placeholder="Agregar palabra clave"
              className={[
                'flex-1 min-w-[200px] border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
                studyLock ? 'bg-gray-100 cursor-not-allowed' : '',
              ].join(' ')}
            />
            <label
              className={[
                'inline-flex items-center gap-2 px-3 py-2 rounded-md border text-[12px] font-medium cursor-pointer select-none transition-colors',
                newKeywordCritical
                  ? 'bg-danger/10 border-danger/30 text-danger'
                  : 'bg-white border-gray-300 text-text-primary/70 hover:bg-gray-50',
                studyLock ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
              title="Si está marcada, esta palabra forzará severidad 5 (auto-SOS)."
            >
              <input
                type="checkbox"
                checked={newKeywordCritical}
                onChange={(e) => setNewKeywordCritical(e.target.checked)}
                disabled={studyLock}
                className="accent-danger"
              />
              Crítica
            </label>
            <button
              type="button"
              onClick={addKeyword}
              disabled={studyLock}
              className={[
                'px-3 py-2 rounded-md text-sm font-medium bg-white border border-gray-300 text-text-primary hover:bg-gray-50 transition-colors',
                studyLock ? 'cursor-not-allowed opacity-60' : '',
              ].join(' ')}
            >
              Agregar
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3 min-h-[40px]">
            {keywords.length === 0 ? (
              <p className="text-[12px] italic text-text-primary/50">
                Sin palabras clave registradas.
              </p>
            ) : (
              keywords.map((kw) => {
                // Two visual styles:
                // - Critical: red background + lock icon + tooltip explaining
                //   the entry forces severity 5. Toggling on the chip body
                //   flips the flag.
                // - Non-critical: accent (teal) background — same UX as
                //   pre-refactor for familiar admins.
                const baseStyle = kw.critical
                  ? 'bg-danger/10 text-danger border-danger/30'
                  : 'bg-accent/10 text-accent border-accent/20'
                return (
                  <span
                    key={kw.keyword}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] font-medium ${baseStyle}`}
                    title={
                      kw.critical
                        ? 'Crítica: dispara severidad 5 automáticamente. Clic en el badge para desmarcarla.'
                        : 'No crítica: suma +1 a la severidad (cap 4). Clic en el badge para marcarla como crítica.'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleKeywordCritical(kw.keyword)}
                      disabled={studyLock}
                      aria-label={
                        kw.critical
                          ? `Desmarcar ${kw.keyword} como crítica`
                          : `Marcar ${kw.keyword} como crítica`
                      }
                      className={`inline-flex items-center gap-1 ${studyLock ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {kw.critical && (
                        <span aria-hidden="true" style={{ fontSize: 10 }}>
                          ●
                        </span>
                      )}
                      {kw.keyword}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw.keyword)}
                      disabled={studyLock}
                      className={`w-4 h-4 inline-flex items-center justify-center rounded-full text-[10px] ${
                        kw.critical ? 'hover:bg-danger/20' : 'hover:bg-accent/20'
                      } ${studyLock ? 'cursor-not-allowed' : ''}`}
                      aria-label={`Eliminar ${kw.keyword}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-text-primary/50 tabular-nums">
              Total: {keywords.length} ·{' '}
              <span className="text-danger font-semibold">
                {keywords.filter((k) => k.critical).length} crítica(s)
              </span>
            </p>
            <SaveButton
              onClick={saveKeywords}
              loading={savingKeywords}
              disabled={!keywordsDirty}
              label="Guardar lista"
            />
          </div>
        </div>
      </div>

      <OverrideConfirmModal
        open={pendingOverride !== null}
        pending={overrideRunning}
        onCancel={() => setPendingOverride(null)}
        onConfirm={() => {
          if (pendingOverride) {
            pendingOverride()
          }
        }}
      />
    </SectionCard>
  )
}

// ============================================================================
// Section 3 — Lineas de Crisis SOS
// ============================================================================

function HotlinesSection({
  initial,
  onChanged,
}: {
  initial: HotlineEntry[]
  onChanged: () => void
}) {
  const addToast = useToastStore((s) => s.addToast)
  const [entries, setEntries] = useState<HotlineEntry[]>(initial)
  const [saving, setSaving] = useState(false)

  useEffect(() => setEntries(initial), [initial])

  const dirty = useMemo(() => {
    if (entries.length !== initial.length) return true
    return entries.some(
      (e, i) => e.name !== initial[i]?.name || e.number !== initial[i]?.number,
    )
  }, [entries, initial])

  function updateRow(index: number, key: keyof HotlineEntry, value: string) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [key]: value } : e)),
    )
  }

  function addRow() {
    setEntries((prev) => [...prev, { name: '', number: '' }])
  }

  function removeRow(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    // Client-side validation
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (!e.name.trim()) {
        addToast({ type: 'error', message: `Fila ${i + 1}: nombre vacio.` })
        return
      }
      if (!isValidPhoneNumber(e.number)) {
        addToast({
          type: 'error',
          message: `Fila ${i + 1}: el número debe contener solo dígitos (7 a 12).`,
        })
        return
      }
    }

    setSaving(true)
    try {
      await apiClient.patch('/admin/config/sos_hotline_numbers', {
        value: entries.map((e) => ({ name: e.name.trim(), number: e.number.trim() })),
      })
      addToast({ type: 'success', message: 'Lineas de crisis actualizadas.' })
      onChanged()
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo actualizar las lineas de crisis.'),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      index="03"
      title="Lineas de crisis SOS"
      description="Números telefónicos que se muestran al estudiante al activar el panel SOS."
    >
      <div className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-[12px] italic text-text-primary/50 py-3">
            No hay lineas configuradas todavia.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry, idx) => {
              const numberInvalid =
                entry.number.length > 0 && !isValidPhoneNumber(entry.number)
              return (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_180px_auto] gap-2 items-start border border-gray-200 rounded-md p-3 bg-white"
                >
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
                      htmlFor={`hot-name-${idx}`}
                    >
                      Nombre
                    </label>
                    <input
                      id={`hot-name-${idx}`}
                      type="text"
                      value={entry.name}
                      onChange={(e) => updateRow(idx, 'name', e.target.value)}
                      placeholder="Linea Vida Bogota"
                      className="border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-[10px] font-semibold uppercase tracking-wider text-text-primary/60"
                      htmlFor={`hot-num-${idx}`}
                    >
                      Numero
                    </label>
                    <input
                      id={`hot-num-${idx}`}
                      type="text"
                      value={entry.number}
                      onChange={(e) => updateRow(idx, 'number', e.target.value)}
                      placeholder="018000113113"
                      inputMode="numeric"
                      className={[
                        'border rounded-md px-2.5 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-primary/30',
                        numberInvalid
                          ? 'border-danger focus:border-danger'
                          : 'border-gray-300 focus:border-primary',
                      ].join(' ')}
                    />
                    {numberInvalid && (
                      <p className="text-[11px] text-danger">Solo dígitos, 7 a 12 caracteres.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="self-end text-xs text-danger hover:underline px-2 py-2"
                    aria-label={`Eliminar fila ${idx + 1}`}
                  >
                    Eliminar
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Agregar linea
          </button>
          <SaveButton onClick={save} loading={saving} disabled={!dirty} label="Guardar lineas" />
        </div>
      </div>
    </SectionCard>
  )
}

// ============================================================================
// Section 4 — API Gemini
// ============================================================================

interface LLMLastTest {
  at: string
  ok: boolean
  latency_ms: number
  error: string | null
}

interface LLMInfo {
  provider: string
  base_url: string
  model: string
  api_key_masked: string
  api_key_configured: boolean
  timeout_ms: number
  last_test: LLMLastTest | null
}

/**
 * `GeminiSection` muestra un snapshot read-only de la configuración LLM
 * + un botón de prueba de conectividad. Todo se gestiona via `.env`
 * (API key, provider, modelo, base URL, timeout) — esto NO es por
 * decisión de UX sino por seguridad (las API keys son secretos y no
 * pertenecen a la BD operacional). El panel sirve para:
 *
 *   1. Verificar de un vistazo qué proveedor / modelo está activo.
 *   2. Saber si la API key está configurada (sin exponerla).
 *   3. Disparar una prueba de conexión y persistirla.
 *
 * El resultado de la última prueba se guarda en
 * `system_config.llm_last_test` para que sobreviva reloads.
 */
function GeminiSection() {
  const addToast = useToastStore((s) => s.addToast)
  const [info, setInfo] = useState<LLMInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [testing, setTesting] = useState(false)

  const loadInfo = useCallback(async () => {
    try {
      const res = await apiClient.get<LLMInfo>('/admin/llm-info')
      setInfo(res.data ?? null)
    } catch (err) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo cargar la configuración LLM.'),
      })
    } finally {
      setLoadingInfo(false)
    }
  }, [addToast])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  async function runTest() {
    setTesting(true)
    try {
      const res = await apiClient.post<GeminiTestResult>('/admin/config/gemini/test')
      const data = res.data
      if (data?.ok) {
        addToast({
          type: 'success',
          message: `Conexión OK (${data.latency_ms} ms).`,
        })
      } else {
        addToast({
          type: 'error',
          message: data?.error
            ? `El proveedor no respondió correctamente: ${data.error}`
            : 'El proveedor no respondió correctamente.',
        })
      }
      // Refresh info so `last_test` updates from the BD-persisted value.
      await loadInfo()
    } catch (err: unknown) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'Error al probar la conexión LLM.'),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <SectionCard
      index="04"
      title="Proveedor LLM"
      description="Snapshot de la configuración del modelo de lenguaje. Solo lectura — para cambiar cualquier parámetro edita .env y reinicia el backend."
    >
      {loadingInfo || !info ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="animate-pulse h-16 rounded-md bg-gray-100"
            />
          ))}
        </div>
      ) : (
        <>
          {/* Configuration grid — 5 cards in 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoTile
              label="Proveedor activo"
              value={info.provider}
              envHint=".env LLM_PROVIDER"
            />
            <InfoTile
              label="Modelo"
              value={info.model}
              envHint=".env LLM_MODEL"
            />
            <InfoTile
              label="Endpoint"
              value={info.base_url}
              envHint=".env LLM_BASE_URL"
              wrap
            />
            <InfoTile
              label="API Key"
              value={info.api_key_masked}
              envHint=".env LLM_API_KEY / GEMINI_API_KEY"
              accent={info.api_key_configured ? 'success' : 'danger'}
            />
            <InfoTile
              label="Timeout"
              value={`${info.timeout_ms.toLocaleString('es-CO')} ms`}
              envHint=".env LLM_TIMEOUT_MS"
            />
            {/* 6th tile balances the 2-col grid */}
            <div className="md:flex hidden" aria-hidden />
          </div>

          {/* Last test + action bar */}
          <div className="mt-5 border-t border-gray-100 pt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {info.last_test ? (
                <span
                  className={[
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium border',
                    info.last_test.ok
                      ? 'bg-success/10 text-success border-success/30'
                      : 'bg-danger/10 text-danger border-danger/30',
                  ].join(' ')}
                  title={`Última prueba: ${info.last_test.at}`}
                >
                  <span
                    className={[
                      'w-2 h-2 rounded-full',
                      info.last_test.ok ? 'bg-success' : 'bg-danger',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  {info.last_test.ok ? 'Última prueba: OK' : 'Última prueba: error'}
                  <span className="font-mono text-text-primary/70">
                    {info.last_test.latency_ms.toLocaleString('es-CO')} ms
                  </span>
                  <span className="text-text-primary/50">
                    · {formatRelativeTime(info.last_test.at)}
                  </span>
                  {!info.last_test.ok && info.last_test.error && (
                    <span className="text-danger/80 max-w-[200px] truncate">
                      · {info.last_test.error}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[12px] text-text-primary/50 italic">
                  Sin pruebas previas. Ejecuta una para registrar el estado.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              // Outline / secondary styling: this is a diagnostic
              // action (non-destructive, easily repeatable). Solid
              // red was visually overloaded with destructive CTAs
              // elsewhere in the panel ("Eliminar borrador",
              // "Deshabilitar seleccionados"). Outline neutral makes
              // the affordance clearly "safe to click".
              className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold border border-text-primary/30 text-text-primary bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {testing ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>
        </>
      )}
    </SectionCard>
  )
}

function InfoTile({
  label,
  value,
  envHint,
  accent,
  wrap,
}: {
  label: string
  value: string
  envHint: string
  accent?: 'success' | 'danger'
  wrap?: boolean
}) {
  const valueColor =
    accent === 'success'
      ? 'var(--success-700)'
      : accent === 'danger'
        ? 'var(--danger-700)'
        : 'var(--ink-900)'
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-gray-50/40">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-primary/50">
        {label}
      </p>
      <p
        className="font-mono text-sm mt-1"
        style={{
          color: valueColor,
          wordBreak: wrap ? 'break-all' : 'normal',
        }}
      >
        {value}
      </p>
      <p className="text-[11px] text-text-primary/50 mt-1">{envHint}</p>
    </div>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    if (Number.isNaN(diffMs)) return ''
    const sec = Math.floor(diffMs / 1000)
    if (sec < 5) return 'hace instantes'
    if (sec < 60) return `hace ${sec} s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `hace ${min} min`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `hace ${hr} h`
    const days = Math.floor(hr / 24)
    return `hace ${days} d`
  } catch {
    return ''
  }
}

// ============================================================================
// Section 5 — Estado del sistema
// ============================================================================

interface ServiceCheck {
  label: string
  status: 'ok' | 'fail' | 'warn' | 'na'
  value: string
  detail?: string | null
}

interface ServicesHealth {
  checked_at: string
  services: ServiceCheck[]
}

/**
 * `SystemStatusSection` lee `/admin/services-health` que el backend
 * acaba de exponer y muestra el estado REAL de cada dependencia. La
 * versión anterior hardcodeaba "Configurado" para TTS / ASR aunque
 * el binario o el modelo no estuviera presente — ahora cada fila
 * refleja la realidad del proceso.
 *
 * Además mostramos:
 *   - Versión de la app (env `VITE_APP_VERSION`).
 *   - Service Worker (PWA) — chequeo client-side (no requiere endpoint).
 *   - Timestamp del último chequeo + "hace X" relativo para que el
 *     admin sepa qué tan fresco es el dato.
 */
function SystemStatusSection() {
  const [data, setData] = useState<ServicesHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [swActive, setSwActive] = useState<boolean>(false)
  const addToast = useToastStore((s) => s.addToast)

  const appVersion = useMemo(() => {
    const v = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0'
    return v
  }, [])

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get<ServicesHealth>('/admin/services-health')
      setData(res.data ?? null)
    } catch (err) {
      addToast({
        type: 'error',
        message: formatApiError(err, 'No se pudo cargar el estado del sistema.'),
      })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      setSwActive(Boolean(navigator.serviceWorker.controller))
    }
  }, [])

  function StatusDot({
    state,
  }: {
    state: 'ok' | 'fail' | 'warn' | 'loading' | 'na'
  }) {
    const cls =
      state === 'ok'
        ? 'bg-success'
        : state === 'fail'
          ? 'bg-danger'
          : state === 'warn'
            ? 'bg-warning'
            : state === 'loading'
              ? 'bg-gray-300 animate-pulse'
              : 'bg-gray-300'
    return <span className={`w-2 h-2 rounded-full ${cls}`} aria-hidden="true" />
  }

  // Rows: backend-checked rows + frontend-only ones (version, SW).
  // Order matters for UX: most-critical (DB/LLM) first, informational
  // (uptime, version) at the bottom.
  const backendRows = data?.services ?? []
  const frontendRows: ServiceCheck[] = [
    {
      label: 'Versión de la app',
      status: 'na',
      value: appVersion,
      detail: 'VITE_APP_VERSION (build-time)',
    },
    {
      label: 'Service Worker (PWA)',
      status: swActive ? 'ok' : 'na',
      value: swActive ? 'Activo' : 'No detectado',
      detail: swActive
        ? 'El navegador tiene el SW registrado y controlando esta pestaña.'
        : 'Normal en desarrollo. En producción la PWA debe estar instalada.',
    },
  ]
  const allRows = [...backendRows, ...frontendRows]

  return (
    <SectionCard
      index="05"
      title="Estado del sistema"
      description="Diagnóstico en tiempo real de servicios y versión desplegada."
    >
      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="animate-pulse h-12 rounded bg-gray-100"
            />
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {allRows.map((row, i) => (
                <tr
                  key={row.label}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
                  title={row.detail ?? undefined}
                >
                  <td className="px-4 py-3 text-text-primary/70 w-[260px] align-top">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-text-primary font-medium align-top">
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 shrink-0">
                        <StatusDot state={row.status} />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span>{row.value}</span>
                        {row.detail && (
                          <span className="text-[11px] text-text-primary/50 font-normal">
                            {row.detail}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] text-text-primary/50">
          {data
            ? `Último chequeo: ${formatRelativeTime(data.checked_at)}`
            : 'Sin datos aún.'}
        </span>
        <button
          type="button"
          onClick={fetchHealth}
          disabled={loading}
          className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold border border-text-primary/30 text-text-primary bg-white hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Comprobando…' : 'Volver a comprobar'}
        </button>
      </div>
    </SectionCard>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function Config() {
  const addToast = useToastStore((s) => s.addToast)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [configMap, setConfigMap] = useState<Record<string, SystemConfigItem>>({})

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await apiClient.get<{ items: SystemConfigItem[] } | SystemConfigItem[]>(
        '/admin/config',
      )
      const items = Array.isArray(res.data)
        ? res.data
        : (res.data?.items ?? [])
      setConfigMap(indexByKey(items))
    } catch (err: unknown) {
      const msg = formatApiError(
        err,
        'No se pudo cargar la configuración del sistema.',
      )
      setErrorMsg(msg)
      addToast({ type: 'error', message: msg })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const initialKeywords = asKeywordArray(configMap['safety_keywords']?.value)
  const initialThreshold = asThreshold(configMap['sos_severity_threshold']?.value)
  const initialEnabled = asGuardrailsEnabled(configMap['guardrails_enabled']?.value)
  const initialStudyLock = asBool(configMap['study_lock_enabled']?.value)
  const initialHotlines = asHotlineArray(configMap['sos_hotline_numbers']?.value)

  return (
    <div
      className="fade-in"
      style={{
        padding: 32,
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
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
          Operación
        </p>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--ink-900)',
            marginTop: 6,
            marginBottom: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          Configuración del sistema
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--ink-500)',
            marginTop: 6,
            marginBottom: 0,
          }}
        >
          Parámetros operativos, guardrails, líneas de crisis y diagnóstico técnico.
        </p>
      </header>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
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
            onClick={loadConfig}
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
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg h-32 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ConsentSection />
          <GuardrailsSection
            initialKeywords={initialKeywords}
            initialThreshold={initialThreshold}
            initialEnabled={initialEnabled}
            initialStudyLock={initialStudyLock}
            onChanged={loadConfig}
          />
          <HotlinesSection initial={initialHotlines} onChanged={loadConfig} />
          <GeminiSection />
          <SystemStatusSection />
        </div>
      )}
    </div>
  )
}
