import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, MessageCircle, CornerDownLeft } from 'lucide-react'

interface Session {
  id: string
  started_at: string
  ended_at: string | null
  topic_hint: string | null
}

interface SessionSearchModalProps {
  open: boolean
  onClose: () => void
  sessions: Session[]
}

/**
 * Time-bucket label for a session start date, evaluated against `now`.
 * Buckets follow the same vocabulary Claude uses ("Hoy", "Ayer", ...) so
 * users with cross-app habits read it without thinking.
 */
function bucketLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6) // last 7 days inclusive
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  if (date >= startOfToday) return 'Hoy'
  if (date >= startOfYesterday) return 'Ayer'
  if (date >= startOfWeek) return 'Esta semana'
  if (date >= startOfMonth) return 'Este mes'
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Build a human title for a session. Prefer `topic_hint`; fall back to the
 * formatted start date so empty/legacy sessions are still findable.
 */
function sessionTitle(s: Session): string {
  if (s.topic_hint && s.topic_hint.trim()) return s.topic_hint.trim()
  try {
    const d = new Date(s.started_at)
    return `Sesión del ${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
  } catch {
    return 'Sesión'
  }
}

/**
 * Strip diacritics for tolerant matching ("dia" should match "día").
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const MAX_RESULTS = 24

export default function SessionSearchModal({
  open,
  onClose,
  sessions,
}: SessionSearchModalProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sorted + filtered list, memoised. Empty query = most-recent first.
  const results = useMemo(() => {
    const q = normalize(query.trim())
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    if (!q) return sorted.slice(0, MAX_RESULTS)
    return sorted
      .filter((s) => normalize(sessionTitle(s)).includes(q))
      .slice(0, MAX_RESULTS)
  }, [sessions, query])

  // Reset on each open and focus the input.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    // Defer focus to after the render so the input exists.
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  // Reset active highlight whenever the result set shrinks/changes.
  useEffect(() => {
    if (activeIndex > results.length - 1) setActiveIndex(0)
  }, [results, activeIndex])

  const openSelected = useCallback(
    (s: Session | undefined) => {
      if (!s) return
      const target = s.ended_at ? `/session/${s.id}/detail` : `/session/${s.id}/chat`
      onClose()
      navigate(target)
    },
    [navigate, onClose],
  )

  // Global key handling while open.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        openSelected(results[activeIndex])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, activeIndex, openSelected, onClose])

  // Scroll the active row into view if it leaves the viewport of the list.
  useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(`[data-row="${activeIndex}"]`)
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar sesiones"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(26, 17, 16, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: 16,
        paddingRight: 16,
        animation: 'fadeIn var(--dur-base) var(--ease-out)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scale-in"
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: 'min(72vh, 600px)',
          background: '#fff',
          border: '1px solid var(--ink-200)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* Search input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--ink-100)',
          }}
        >
          <Search size={18} color="var(--ink-500)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en tus sesiones…"
            aria-label="Buscar en tus sesiones"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 15,
              fontFamily: 'var(--font-sans)',
              color: 'var(--ink-900)',
              background: 'transparent',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar búsqueda"
            title="Cerrar (Esc)"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ink-100)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Resultados"
          style={{ overflowY: 'auto', padding: '6px 6px 8px' }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--ink-500)',
                fontSize: 13.5,
              }}
            >
              {query.trim() ? (
                <>
                  No hay sesiones que coincidan con{' '}
                  <span style={{ color: 'var(--ink-700)', fontWeight: 600 }}>«{query}»</span>.
                </>
              ) : (
                'Aún no tienes sesiones guardadas.'
              )}
            </div>
          ) : (
            results.map((s, i) => {
              const active = i === activeIndex
              return (
                <button
                  type="button"
                  key={s.id}
                  data-row={i}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => openSelected(s)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: active ? 'var(--mabel-50)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    textAlign: 'left',
                    color: 'var(--ink-900)',
                    transition: 'background var(--dur-fast) var(--ease-out)',
                  }}
                >
                  <MessageCircle
                    size={16}
                    color={active ? 'var(--mabel-600)' : 'var(--ink-500)'}
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      fontWeight: active ? 600 : 500,
                      color: 'var(--ink-900)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sessionTitle(s)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: active ? 'var(--mabel-700)' : 'var(--ink-400)',
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {bucketLabel(s.started_at)}
                  </span>
                  {active && (
                    <CornerDownLeft
                      size={13}
                      color="var(--mabel-600)"
                      style={{ flexShrink: 0 }}
                      aria-hidden
                    />
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer — keyboard hints */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            borderTop: '1px solid var(--ink-100)',
            fontSize: 11,
            color: 'var(--ink-400)',
            background: 'var(--ink-50)',
          }}
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar · <Kbd>↵</Kbd> abrir · <Kbd>Esc</Kbd> cerrar
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        margin: '0 1px',
        background: '#fff',
        border: '1px solid var(--ink-200)',
        borderRadius: 4,
        fontSize: 10.5,
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink-700)',
        lineHeight: 1.4,
      }}
    >
      {children}
    </kbd>
  )
}
