import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, Hourglass, MessageCircle, Smile, Moon, Target, Sparkles } from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import Markdown from '../components/ui/Markdown'
import UmbAvatar from '../components/ui/UmbAvatar'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'Menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

const FOCUS_LABELS: Record<string, string> = {
  Academico: 'Académico',
  Social: 'Social',
  Familiar: 'Familiar',
  Salud: 'Salud',
  Economico: 'Económico',
  Otro: 'Otro',
}

function AssistantAvatar() {
  return <UmbAvatar size={32} style={{ marginTop: 2 }} />
}

interface SessionData {
  started_at: string
  ended_at: string | null
  checkin_payload?: { mood?: number; sleep?: number; focus?: string; note?: string } | null
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const { loadSession, messages, loadMessages, isLoadingMessages } = useChatStore()

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    loadSession(id)
      .then((s) => {
        if (!s.ended_at) {
          navigate(`/session/${id}/chat`, { replace: true })
          return
        }
        setSession(s as unknown as SessionData)
        return loadMessages(id)
      })
      .catch(() => navigate('/403', { replace: true }))
      .finally(() => setLoading(false))
  }, [id, loadSession, loadMessages, navigate])

  if (loading || !session) {
    return (
      <div
        className="fade-in"
        style={{
          padding: 32,
          maxWidth: 880,
          margin: '0 auto',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <SkeletonChat />
      </div>
    )
  }

  const checkin = session.checkin_payload
  const hasCheckin = checkin && Object.values(checkin).some((v) => v !== undefined && v !== null && v !== '')

  return (
    <div
      className="fade-in mobile-fab-safe-left"
      style={{
        padding: 32,
        maxWidth: 880,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <SosButton variant="floating" onClick={openCrisis} />
      {/* Breadcrumb */}
      <nav
        aria-label="Ruta"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12.5,
          color: 'var(--ink-500)',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/home')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ink-500)',
            padding: 0,
            fontSize: 12.5,
            fontFamily: 'var(--font-sans)',
            transition: 'color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--mabel-700)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--ink-500)')}
        >
          Inicio
        </button>
        <span style={{ color: 'var(--ink-300)' }}>›</span>
        <span style={{ color: 'var(--ink-700)' }}>
          Sesión del {formatDateTime(session.started_at)}
        </span>
      </nav>

      {/* Eyebrow + title */}
      <header style={{ marginBottom: 22 }}>
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
          Sesión finalizada
        </p>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--ink-900)',
            marginTop: 6,
            marginBottom: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          Detalle de la conversación
        </h1>
      </header>

      {/* Metadata cards */}
      <section
        aria-label="Datos de la sesión"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <MetaCard
          icon={<Calendar size={14} />}
          label="Inicio"
          value={formatDateTime(session.started_at)}
        />
        <MetaCard
          icon={<Clock size={14} />}
          label="Fin"
          value={session.ended_at ? formatDateTime(session.ended_at) : '—'}
        />
        <MetaCard
          icon={<Hourglass size={14} />}
          label="Duración"
          value={
            session.ended_at
              ? formatDuration(session.started_at, session.ended_at)
              : '—'
          }
        />
      </section>

      {/* Check-in card */}
      {hasCheckin && (
        <section
          aria-label="Check-in inicial"
          style={{
            background: 'var(--mabel-50)',
            border: '1px solid var(--mabel-200)',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
              color: 'var(--mabel-800)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <Sparkles size={14} color="var(--mabel-700)" />
            Contexto inicial
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {checkin?.mood !== undefined && (
              <CheckinChip icon={<Smile size={14} />} label="Ánimo" value={`${checkin.mood}/10`} />
            )}
            {checkin?.sleep !== undefined && (
              <CheckinChip icon={<Moon size={14} />} label="Sueño" value={`${checkin.sleep} h`} />
            )}
            {checkin?.focus && (
              <CheckinChip
                icon={<Target size={14} />}
                label="Enfoque"
                value={FOCUS_LABELS[checkin.focus] ?? checkin.focus}
              />
            )}
          </div>
          {checkin?.note && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                background: '#fff',
                border: '1px solid var(--mabel-100)',
                borderRadius: 10,
                fontSize: 12.5,
                color: 'var(--ink-700)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <strong style={{ fontWeight: 700, color: 'var(--ink-900)' }}>Nota:</strong>{' '}
              {checkin.note}
            </div>
          )}
        </section>
      )}

      {/* Conversation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
          color: 'var(--ink-500)',
          marginBottom: 12,
        }}
      >
        <MessageCircle size={12} />
        Conversación
      </div>

      {isLoadingMessages ? (
        <SkeletonChat />
      ) : messages.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: '1px dashed var(--ink-200)',
            borderRadius: 14,
            padding: '28px 24px',
            textAlign: 'center',
            color: 'var(--ink-500)',
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          No hubo mensajes en esta sesión.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {messages.map((msg) => {
            const isUser = msg.role === 'user'
            if (isUser) {
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div style={{ maxWidth: '78%' }}>
                    <div
                      style={{
                        background: 'var(--mabel-600)',
                        color: '#fff',
                        borderRadius: '18px 18px 4px 18px',
                        padding: '10px 14px',
                        fontSize: 14,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.content}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-400)',
                        marginTop: 4,
                        textAlign: 'right',
                      }}
                    >
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  justifyContent: 'flex-start',
                }}
              >
                <AssistantAvatar />
                <div style={{ maxWidth: '78%' }}>
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid var(--ink-200)',
                      borderRadius: '4px 18px 18px 18px',
                      padding: '10px 14px',
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: 'var(--ink-900)',
                    }}
                  >
                    <Markdown text={msg.content} />
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ink-400)',
                      marginTop: 4,
                    }}
                  >
                    {formatTime(msg.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 18,
          borderTop: '1px solid var(--ink-100)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/home')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 14px',
            background: '#fff',
            color: 'var(--ink-700)',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ink-50)'
            e.currentTarget.style.borderColor = 'var(--ink-300)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#fff'
            e.currentTarget.style.borderColor = 'var(--ink-200)'
          }}
        >
          <ArrowLeft size={14} />
          Volver
        </button>

        <button
          type="button"
          disabled
          title="Próximamente"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            background: 'transparent',
            color: 'var(--ink-400)',
            border: '1px solid var(--ink-200)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'not-allowed',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Eliminar sesión
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 999,
              background: 'var(--ink-100)',
              color: 'var(--ink-500)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Próximamente
          </span>
        </button>
      </div>
    </div>
  )
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--ink-200)',
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--ink-500)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 4,
        }}
      >
        {icon}
        {label}
      </div>
      <p
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: 'var(--ink-900)',
          margin: 0,
          lineHeight: 1.35,
        }}
      >
        {value}
      </p>
    </div>
  )
}

function CheckinChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--mabel-100)',
        borderRadius: 10,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ink-500)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {icon}
        {label}
      </div>
      <p
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: 'var(--mabel-800)',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>
    </div>
  )
}
