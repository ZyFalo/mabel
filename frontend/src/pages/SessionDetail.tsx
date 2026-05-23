import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import apiClient from '../api/client'
import ConfirmDeleteSessionModal from '../components/chat/ConfirmDeleteSessionModal'
import HeartRating from '../components/chat/HeartRating'
import { useToastStore } from '../stores/toastStore'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Hourglass,
  MessageCircle,
  Smile,
  Moon,
  Target,
  Sparkles,
  Battery,
  Flame,
  UserCheck,
} from 'lucide-react'
import { useChatStore } from '../stores/chatStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import Markdown from '../components/ui/Markdown'
import UmbAvatar from '../components/ui/UmbAvatar'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'
import { FOCUS_LABEL_MAP, normalizeFocus } from '../constants/checkin'

// Etiquetas humanas para las escalas 1-4 + sleep_quality. Duplicadas
// localmente (no en constants/checkin.ts) porque el render de la
// página de detalle puede divergir del formulario en el futuro y
// preferimos no acoplarlo. Los slugs sí provienen del catálogo del
// student-side para garantizar mapping consistente.
const ENERGY_LABEL: Record<number, string> = {
  1: 'Sin batería',
  2: 'Baja',
  3: 'Suficiente',
  4: 'Con todo',
}
const STRESS_LABEL: Record<number, string> = {
  1: 'Nada',
  2: 'Un poco',
  3: 'Bastante',
  4: 'Muchísimo',
}
const LONELINESS_LABEL: Record<number, string> = {
  1: 'Muy sola/o',
  2: 'Algo sola/o',
  3: 'Acompañada/o',
  4: 'Muy acompañada/o',
}
const SLEEP_QUALITY_LABEL: Record<string, string> = {
  mal: 'Mal',
  regular: 'Regular',
  bien: 'Bien',
  muy_bien: 'Muy bien',
}

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

function AssistantAvatar() {
  return <UmbAvatar size={32} style={{ marginTop: 2 }} />
}

interface SessionData {
  started_at: string
  ended_at: string | null
  // El check-in evolucionó (2026-05-23) de 4 a 7 campos opcionales.
  // Mantenemos tipo amplio para soportar sesiones legacy (solo mood/
  // sleep/focus/note) y nuevas (con energy/stress/loneliness/
  // sleep_quality/focus_other). `focus` puede ser string (legacy) o
  // string[] (multi-select nuevo).
  checkin_payload?: {
    mood?: number
    energy?: number
    stress?: number
    sleep_quality?: string
    sleep?: number
    loneliness?: number
    focus?: string | string[]
    focus_other?: string
    note?: string
  } | null
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  const { loadSession, messages, loadMessages, isLoadingMessages } = useChatStore()

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  // Estado del modal de confirmación hard-delete (paquete control de
  // datos 2026-05-23). Reusa ConfirmDeleteSessionModal del sidebar
  // para mantener UX consistente.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  async function handleConfirmDelete() {
    if (!id) return
    setDeleteSubmitting(true)
    try {
      await apiClient.delete(`/sessions/${id}`)
      addToast({
        type: 'success',
        message: 'Conversación eliminada definitivamente',
      })
      navigate('/home')
    } catch {
      addToast({
        type: 'error',
        message: 'No pudimos eliminar la conversación. Intenta de nuevo.',
      })
      setDeleteSubmitting(false)
    }
  }

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
            {/* Ánimo (mood 0-10). Renderear incluso con 0 — antes la
                comprobación `!== undefined` ya lo cubría correctamente,
                pero validamos explícito con typeof number para no caer
                en falsy en futuros refactors. */}
            {typeof checkin?.mood === 'number' && (
              <CheckinChip icon={<Smile size={14} />} label="Ánimo" value={`${checkin.mood}/10`} />
            )}
            {/* Energía (1-4) — campo nuevo 2026-05-23 */}
            {typeof checkin?.energy === 'number' && (
              <CheckinChip
                icon={<Battery size={14} />}
                label="Energía"
                value={ENERGY_LABEL[checkin.energy] ?? `${checkin.energy}/4`}
              />
            )}
            {/* Agobio (1-4) — campo nuevo 2026-05-23 */}
            {typeof checkin?.stress === 'number' && (
              <CheckinChip
                icon={<Flame size={14} />}
                label="Agobio"
                value={STRESS_LABEL[checkin.stress] ?? `${checkin.stress}/4`}
              />
            )}
            {/* Sueño: calidad subjetiva (nueva) + horas (legacy o
                complementario). Si solo hay horas, formato antiguo. */}
            {(typeof checkin?.sleep === 'number' || typeof checkin?.sleep_quality === 'string') && (
              <CheckinChip
                icon={<Moon size={14} />}
                label="Sueño"
                value={
                  checkin?.sleep_quality
                    ? `${SLEEP_QUALITY_LABEL[checkin.sleep_quality] ?? checkin.sleep_quality}${typeof checkin.sleep === 'number' ? ` · ${checkin.sleep} h` : ''}`
                    : `${checkin?.sleep} h`
                }
              />
            )}
            {/* Compañía / soledad (1-4) — campo nuevo 2026-05-23 */}
            {typeof checkin?.loneliness === 'number' && (
              <CheckinChip
                icon={<UserCheck size={14} />}
                label="Compañía"
                value={LONELINESS_LABEL[checkin.loneliness] ?? `${checkin.loneliness}/4`}
              />
            )}
            {(() => {
              const focusList = normalizeFocus(checkin?.focus)
              if (focusList.length === 0) return null
              const value = focusList
                .map((f) => FOCUS_LABEL_MAP[f] ?? f)
                .join(' · ')
              return (
                <CheckinChip
                  icon={<Target size={14} />}
                  label={focusList.length > 1 ? 'Enfoques' : 'Enfoque'}
                  value={value}
                />
              )
            })()}
            {/* Texto libre "Otro foco" cuando se marcó la categoría
                Otro + se llenó el mini-input. */}
            {typeof checkin?.focus_other === 'string' && checkin.focus_other.trim() && (
              <CheckinChip
                icon={<Target size={14} />}
                label="Otro foco"
                value={checkin.focus_other.trim()}
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

      {/* Heart rating — solo en sesiones finalizadas (que es siempre
          el caso aqui, pero validamos defensivamente). Aparece arriba
          del header "Conversación", mismo patron que en Chat.tsx
          cuando sessionEnded. Como SessionDetail vive en su propia
          ruta `/session/:id/detail`, necesitamos montarlo aqui
          tambien — sino el rating no aparece al volver a sesiones
          cerradas (bug visible 2026-05-23 reportado por el usuario). */}
      {id && session.ended_at && (
        <div style={{ marginBottom: 16, marginInline: -16 }}>
          <div
            style={{
              background: 'var(--mabel-50, #FDF2F2)',
              border: '1px solid var(--mabel-100, #F8E0DE)',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <HeartRating sessionId={id} />
          </div>
        </div>
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
          onClick={() => setDeleteOpen(true)}
          title="Eliminar definitivamente esta conversación"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 14px',
            background: 'transparent',
            color: 'var(--danger-700, #B91C1C)',
            border: '1px solid var(--danger-200, #FECACA)',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--danger-50, #FEF2F2)'
            e.currentTarget.style.borderColor = 'var(--danger-600, #DC2626)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'var(--danger-200, #FECACA)'
          }}
        >
          Eliminar sesión
        </button>
      </div>

      <ConfirmDeleteSessionModal
        open={deleteOpen}
        sessionTitle={`Sesión del ${formatDateTime(session.started_at)}`}
        onCancel={() => {
          if (!deleteSubmitting) setDeleteOpen(false)
        }}
        onConfirm={handleConfirmDelete}
        submitting={deleteSubmitting}
      />
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
