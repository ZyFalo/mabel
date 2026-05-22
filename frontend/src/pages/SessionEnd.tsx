import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Sparkles, Clock, MessageCircle, Smile, ArrowRight, Home } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { SkeletonCard } from '../components/ui/Skeleton'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'

interface SessionData {
  started_at: string
  ended_at: string | null
  checkin_payload?: { mood?: number } | null
}

/**
 * Format a duration in minutes. We DO NOT show raw `ended_at - started_at`
 * when the session had zero exchanged messages, because in that case the
 * "duration" is just how long the tab was abandoned before something
 * closed the session — a misleading number for the user.
 */
function formatDuration(minutes: number): string {
  if (minutes < 1) return 'Menos de 1 min'
  if (minutes === 1) return '1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return h === 1 ? '1 hora' : `${h} horas`
  return `${h} h ${m} min`
}

function moodMeta(score: number): { label: string; color: string } {
  if (score >= 8) return { label: 'Muy bien', color: 'var(--success-700)' }
  if (score >= 6) return { label: 'Bien', color: 'var(--success-600)' }
  if (score >= 4) return { label: 'Regular', color: 'var(--warn-700)' }
  if (score >= 2) return { label: 'Bajo', color: 'rgb(194,65,12)' }
  return { label: 'Muy bajo', color: 'var(--danger-700)' }
}

export default function SessionEnd() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const { loadSession, messages, loadMessages } = useChatStore()

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      loadSession(id).then((s) => setSession(s as SessionData)),
      loadMessages(id),
    ]).finally(() => setLoading(false))
  }, [id, loadSession, loadMessages])

  // Lazy-create: matches the sidebar "+ Nueva sesión" pattern. Don't create
  // a session here — let the user land on /home where the composer creates
  // a session only when they actually send.
  function handleNewSession() {
    navigate('/home')
  }

  // Real activity guard. If save_history is OFF, `messages.length` will be
  // 0 even after a real conversation — so we treat the duration with care:
  // we still show it because the backend timestamps are authoritative, but
  // we label the "messages" card honestly.
  const totalMinutes = useMemo(() => {
    if (!session?.started_at || !session?.ended_at) return null
    const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
    return Math.max(0, Math.round(ms / 60000))
  }, [session?.started_at, session?.ended_at])

  const messageCount = messages.length
  const mood = session?.checkin_payload?.mood
  const hadActivity = messageCount > 0
  // If the session was open >30 min with 0 messages, it's almost certainly an
  // abandoned/forced-close scenario. We avoid the misleading "306 minutos" UI.
  const showSuspiciousDuration =
    !hadActivity && totalMinutes !== null && totalMinutes > 30

  if (loading) {
    return (
      <div
        className="fade-in"
        style={{
          maxWidth: 560,
          margin: '0 auto',
          padding: '48px 24px',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div
      className="fade-in"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        fontFamily: 'var(--font-sans)',
        overflowY: 'auto',
      }}
    >
      <SosButton variant="floating" onClick={openCrisis} />
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Hero icon */}
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--mabel-50)',
            border: '1px solid var(--mabel-100)',
            color: 'var(--mabel-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
            boxShadow: 'var(--shadow-brand)',
          }}
        >
          <Sparkles size={28} />
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--ink-900)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          Gracias por conversar conmigo
        </h1>
        <p
          style={{
            fontSize: 14.5,
            color: 'var(--ink-500)',
            margin: '0 auto 28px',
            maxWidth: 440,
            textAlign: 'center',
            lineHeight: 1.55,
          }}
        >
          Cuando quieras volver, estaré aquí. Cuídate mucho.
        </p>

        {/* Resumen — show only what's meaningful */}
        {(hadActivity || mood !== undefined) && (
          <section
            aria-label="Resumen de la sesión"
            style={{
              background: '#fff',
              border: '1px solid var(--ink-200)',
              borderRadius: 14,
              padding: '18px 20px',
              marginBottom: 22,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: 'var(--ink-500)',
              }}
            >
              <Sparkles size={12} color="var(--mabel-600)" />
              Resumen de la sesión
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 14,
              }}
            >
              {/* Messages */}
              <SummaryStat
                icon={<MessageCircle size={14} />}
                label="Mensajes"
                value={hadActivity ? String(messageCount) : '—'}
              />
              {/* Duration — only if there was real activity, otherwise it's misleading */}
              {hadActivity && totalMinutes !== null && (
                <SummaryStat
                  icon={<Clock size={14} />}
                  label="Duración"
                  value={formatDuration(totalMinutes)}
                />
              )}
              {/* Mood from check-in */}
              {mood !== undefined && (
                <SummaryStat
                  icon={<Smile size={14} />}
                  label="Ánimo inicial"
                  value={`${mood}/10`}
                  valueColor={moodMeta(mood).color}
                  hint={moodMeta(mood).label}
                />
              )}
            </div>
          </section>
        )}

        {/* Empty-session note, only when truly suspicious */}
        {showSuspiciousDuration && (
          <p
            style={{
              fontSize: 12.5,
              color: 'var(--ink-400)',
              marginTop: -10,
              marginBottom: 22,
              textAlign: 'center',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            Esta sesión se cerró sin mensajes intercambiados.
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={handleNewSession}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '13px',
              background: 'var(--mabel-600)',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 14.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              boxShadow: 'var(--shadow-brand)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--mabel-700)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--mabel-600)')}
          >
            Comenzar una nueva conversación
            <ArrowRight size={15} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: '100%',
              padding: '11px',
              background: 'transparent',
              color: 'var(--ink-600)',
              border: '1px solid var(--ink-200)',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ink-50)'
              e.currentTarget.style.borderColor = 'var(--ink-300)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'var(--ink-200)'
            }}
          >
            <Home size={14} />
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryStat({
  icon,
  label,
  value,
  valueColor = 'var(--ink-900)',
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueColor?: string
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ink-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: valueColor,
            margin: 0,
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '-0.01em',
          }}
        >
          {value}
        </p>
        {hint && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ink-500)',
              fontWeight: 500,
            }}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
