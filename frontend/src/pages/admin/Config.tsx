import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import { useToastStore } from '../../stores/toastStore'

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

function asKeywordArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map(normalizeKeyword)
      .filter((v) => v.length > 0)
  }
  return []
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
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ version: '', title: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [confirmPublishId, setConfirmPublishId] = useState<string | null>(null)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      // Try a /admin/consent-versions endpoint first, fall back to public endpoint
      let activeVersion: ConsentVersion | null = null
      try {
        const res = await apiClient.get<{ items: ConsentVersion[] }>('/admin/consent-versions')
        const items = res.data?.items ?? []
        activeVersion = items.find((v) => v.status === 'active') ?? null
        const lastDraft = items.find((v) => v.status === 'draft') ?? null
        setDraft(lastDraft)
      } catch {
        // Fallback: read the public active version
        try {
          const res = await apiClient.get<ConsentVersion>('/consent-versions/active')
          activeVersion = res.data ?? null
        } catch {
          activeVersion = null
        }
        setDraft(null)
      }
      setActive(activeVersion)
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
        message: 'Completa version, titulo y contenido antes de crear el borrador.',
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
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo crear el borrador.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePublish(id: string) {
    setPublishing(true)
    try {
      await apiClient.post(`/admin/consent-versions/${id}/publish`)
      addToast({ type: 'success', message: 'Version publicada como activa.' })
      setConfirmPublishId(null)
      await loadVersions()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo publicar la version.',
      })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <SectionCard
      index="01"
      title="Consentimiento informado"
      description="Gestiona la version activa del documento legal y publica nuevas versiones."
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
              </div>
            ) : (
              <p className="text-sm text-text-primary/60 italic mt-2">
                Sin version activa registrada.
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
              <div className="mt-3 border-t border-warning/20 pt-3">
                <p className="text-[12px] text-text-primary/80">
                  Al publicar, todos los usuarios deberan re-aceptar el consentimiento informado.
                </p>
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
                      {publishing ? 'Publicando...' : 'Confirmar publicacion'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmPublishId(draft.id)}
                    className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-warning text-white hover:bg-warning/90 transition-colors"
                  >
                    Publicar version
                  </button>
                )}
              </div>
            </div>
          )}

          {/* New version form */}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary/60">
              Crear nueva version
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
  initialKeywords: string[]
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

  // Keywords
  const [keywords, setKeywords] = useState<string[]>(initialKeywords)
  const [newKeyword, setNewKeyword] = useState('')
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
      keywords.some((k, i) => k !== initialKeywords[i]),
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
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo actualizar el bloqueo de estudio.',
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
    const e = err as { response?: { status?: number; data?: { detail?: string } } }
    if (e?.response?.status === 423) {
      addToast({
        type: 'error',
        message: 'Bloqueo de estudio activo: usa override explicito para modificar guardrails.',
      })
    } else {
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? fallback,
      })
    }
  }

  function addKeyword() {
    const v = normalizeKeyword(newKeyword)
    if (!v) return
    if (keywords.includes(v)) {
      addToast({ type: 'warning', message: `"${v}" ya esta en la lista.` })
      return
    }
    setKeywords((prev) => [...prev, v])
    setNewKeyword('')
  }

  function removeKeyword(kw: string) {
    setKeywords((prev) => prev.filter((k) => k !== kw))
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
                  Bloqueo de configuracion para estudio
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
                Eventos con severidad mayor o igual a este valor disparan derivacion SOS
                automatica.
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
            <span>1 — leve</span>
            <span>2</span>
            <span>3 — media</span>
            <span>4</span>
            <span>5 — critica</span>
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
            Lista de terminos que activan revision manual o filtros de respuesta.
          </p>
          <div className="flex items-center gap-2 mt-3">
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
                'flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
                studyLock ? 'bg-gray-100 cursor-not-allowed' : '',
              ].join(' ')}
            />
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
              keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 text-[12px] font-medium"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeyword(kw)}
                    className="w-4 h-4 inline-flex items-center justify-center rounded-full hover:bg-accent/20 text-[10px]"
                    aria-label={`Eliminar ${kw}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-text-primary/50 tabular-nums">
              Total: {keywords.length}
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
          message: `Fila ${i + 1}: el numero debe contener solo digitos (7 a 12).`,
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
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo actualizar las lineas de crisis.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      index="03"
      title="Lineas de crisis SOS"
      description="Numeros telefonicos que se muestran al estudiante al activar el panel SOS."
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
                      <p className="text-[11px] text-danger">Solo digitos, 7 a 12 caracteres.</p>
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

function GeminiSection() {
  const addToast = useToastStore((s) => s.addToast)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<GeminiTestResult | null>(null)

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      const res = await apiClient.post<GeminiTestResult>('/admin/config/gemini/test')
      setResult(res.data ?? null)
      if (res.data?.ok) {
        addToast({
          type: 'success',
          message: `Gemini OK (${res.data.latency_ms} ms).`,
        })
      } else {
        addToast({
          type: 'error',
          message: res.data?.error
            ? `Gemini no respondio: ${res.data.error}`
            : 'Gemini no respondio correctamente.',
        })
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      addToast({
        type: 'error',
        message: e?.response?.data?.detail ?? 'Error al probar conexion con Gemini.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <SectionCard
      index="04"
      title="API Gemini"
      description="Parametros del proveedor LLM. Configurables solo via variables de entorno."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-primary/50">
            Modelo
          </p>
          <p className="font-mono text-sm text-text-primary mt-1">
            {result?.model ?? 'gemini-2.5-flash'}
          </p>
          <p className="text-[11px] text-text-primary/50 mt-1">
            Configurable solo via reinicio (.env GEMINI_MODEL).
          </p>
        </div>
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-primary/50">
            Timeout
          </p>
          <p className="font-mono text-sm text-text-primary mt-1">30000 ms</p>
          <p className="text-[11px] text-text-primary/50 mt-1">
            Configurable solo via reinicio (.env GEMINI_TIMEOUT_MS).
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {result && (
            <span
              className={[
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium border',
                result.ok
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-danger/10 text-danger border-danger/30',
              ].join(' ')}
            >
              <span
                className={[
                  'w-2 h-2 rounded-full',
                  result.ok ? 'bg-success' : 'bg-danger',
                ].join(' ')}
                aria-hidden="true"
              />
              {result.ok ? 'Conexion OK' : 'Sin respuesta'}
              <span className="font-mono text-text-primary/70">
                {result.latency_ms} ms
              </span>
              {!result.ok && result.error && (
                <span className="text-danger/80 max-w-[200px] truncate">· {result.error}</span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-60 transition-colors"
        >
          {testing ? 'Probando...' : 'Probar conexion'}
        </button>
      </div>
    </SectionCard>
  )
}

// ============================================================================
// Section 5 — Estado del sistema
// ============================================================================

function SystemStatusSection() {
  const [dbStatus, setDbStatus] = useState<'ok' | 'fail' | 'loading'>('loading')
  const [swActive, setSwActive] = useState<boolean>(false)

  const appVersion = useMemo(() => {
    const v = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.1.0'
    return v
  }, [])

  const checkHealth = useCallback(async () => {
    setDbStatus('loading')
    try {
      await apiClient.get('/health')
      setDbStatus('ok')
    } catch {
      setDbStatus('fail')
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      setSwActive(Boolean(navigator.serviceWorker.controller))
    }
  }, [])

  function StatusDot({ state }: { state: 'ok' | 'fail' | 'loading' | 'na' }) {
    const cls =
      state === 'ok'
        ? 'bg-success'
        : state === 'fail'
          ? 'bg-danger'
          : state === 'loading'
            ? 'bg-gray-300 animate-pulse'
            : 'bg-gray-300'
    return <span className={`w-2 h-2 rounded-full ${cls}`} aria-hidden="true" />
  }

  const rows: Array<{
    label: string
    value: string
    state: 'ok' | 'fail' | 'loading' | 'na'
  }> = [
    { label: 'Version de la app', value: appVersion, state: 'na' },
    {
      label: 'Base de datos',
      value:
        dbStatus === 'ok'
          ? 'Conectada'
          : dbStatus === 'fail'
            ? 'No disponible'
            : 'Comprobando...',
      state: dbStatus,
    },
    { label: 'ASR (Whisper)', value: 'Configurado', state: 'na' },
    { label: 'TTS (Piper)', value: 'Configurado', state: 'na' },
    {
      label: 'Service Worker (PWA)',
      value: swActive ? 'Activo' : 'No detectado',
      state: swActive ? 'ok' : 'na',
    },
  ]

  return (
    <SectionCard
      index="05"
      title="Estado del sistema"
      description="Diagnostico rapido de servicios y version desplegada."
    >
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}
              >
                <td className="px-4 py-3 text-text-primary/70 w-[260px]">{row.label}</td>
                <td className="px-4 py-3 text-text-primary font-medium">
                  <span className="inline-flex items-center gap-2">
                    <StatusDot state={row.state} />
                    {row.value}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={checkHealth}
          className="text-sm font-medium text-primary hover:underline"
        >
          Volver a comprobar
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
      const e = err as { response?: { data?: { detail?: string } } }
      const msg =
        e?.response?.data?.detail ?? 'No se pudo cargar la configuracion del sistema.'
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
    <div className="p-6 max-w-[1100px] mx-auto">
      {/* Header */}
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          Operacion
        </p>
        <h1 className="text-2xl font-semibold text-text-primary mt-1">
          Configuracion del sistema
        </h1>
        <p className="text-sm text-text-primary/60 mt-1">
          Parametros operativos, guardrails, lineas de crisis y diagnostico tecnico.
        </p>
      </header>

      {/* Error */}
      {errorMsg && (
        <div
          role="alert"
          className="mb-4 border border-danger/30 bg-danger/5 rounded-lg px-4 py-3 text-sm text-danger flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={loadConfig}
            className="text-xs font-semibold underline hover:no-underline"
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
