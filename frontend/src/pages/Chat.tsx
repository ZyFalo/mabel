import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Copy, Flag, MoreVertical, Lock, Mic } from 'lucide-react'
import CheckinContextPopover from '../components/chat/CheckinContextPopover'
import HeartRating from '../components/chat/HeartRating'
import UmbAvatar from '../components/ui/UmbAvatar'
import SosButton from '../components/ui/SosButton'
import type { StudentOutletContext } from '../types/studentOutlet'
import apiClient from '../api/client'
import { useChatStore } from '../stores/chatStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import ConfirmModal from '../components/ui/ConfirmModal'
import ReportModal from '../components/chat/ReportModal'
import SosPanel from '../components/sos/SosPanel'
import Composer from '../components/chat/Composer'
import Markdown from '../components/ui/Markdown'
import useAudioRecorder from '../hooks/useAudioRecorder'
import useTts from '../hooks/useTts'
import useSubtitles from '../hooks/useSubtitles'
import useLlmPrewarm from '../hooks/useLlmPrewarm'
import useElapsedSeconds from '../hooks/useElapsedSeconds'
import LlmStatusChip from '../components/chat/LlmStatusChip'
import StreamingIndicator from '../components/chat/StreamingIndicator'

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadReportedIds(
  messages: { id: string; role: string }[],
): Promise<Set<string>> {
  const assistantMsgs = messages.filter((m) => m.role === 'assistant')
  if (assistantMsgs.length === 0) return new Set()

  const results = await Promise.allSettled(
    assistantMsgs.map((m) => apiClient.get(`/messages/${m.id}/reports/check`)),
  )

  const reported = new Set<string>()
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.data.already_reported) {
      reported.add(assistantMsgs[i].id)
    }
  })
  return reported
}

// Assistant avatar — UMB shield used before every Mabel message.
function AssistantAvatar() {
  return <UmbAvatar size={32} style={{ marginTop: 2 }} />
}

export default function Chat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { openCrisis } = useOutletContext<StudentOutletContext>()
  // Initial-mount guard: prevents StrictMode (dev) or any remount from
  // firing the greeting / pending-message logic twice for the same session.
  const initRef = useRef<string | null>(null)
  const {
    messages,
    isStreaming,
    streamingText,
    isLoadingMessages,
    currentSession,
    loadSession,
    loadMessages,
    sendMessage,
    endSession,
  } = useChatStore()
  const addToast = useToastStore((s) => s.addToast)

  const [input, setInput] = useState('')
  const [showEndModal, setShowEndModal] = useState(false)
  const [showSos, setShowSos] = useState(false)
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const [isProcessingAudio, setIsProcessingAudio] = useState(false)
  const [subtitleMessageId, setSubtitleMessageId] = useState<string | null>(
    null,
  )
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Estado del "primera respuesta de Mabel" — cubre el gap entre el
  // submit del check-in (o el envio del primer mensaje desde Home)
  // y el primer chunk del LLM. Mientras esto sea true:
  //   - El landing "Estoy aquí, escuchándote" no se renderea; en su
  //     lugar se muestra una burbuja con typing indicator (puntos)
  //     que comunica "Mabel está pensando".
  //   - El composer queda deshabilitado para evitar que el estudiante
  //     mande un mensaje encima del greeting que aun se procesa.
  // Sin este flag, el usuario veia el landing vacio durante 1-3s
  // post-checkin sin ninguna indicacion de actividad — feedback bug
  // reportado el 2026-05-23.
  const [awaitingFirstResponse, setAwaitingFirstResponse] = useState(false)

  const preferences = usePreferencesStore((s) => s.preferences)
  const acc = preferences?.accessibility as Record<string, unknown> | null
  // OPT-IN, no opt-out: el chat de texto NO debe leer en voz alta
  // automáticamente. Solo si la usuaria activó explícitamente
  // `tts_enabled = true` en Settings → Accesibilidad. El modo voz
  // tiene su propio TTS independiente de esta preferencia.
  // (Bug reportado 2026-05-23: chat texto leía mensajes sin permiso.)
  const ttsEnabled = acc?.tts_enabled === true
  // Subtitulos NO cambian aqui: el bug original era solo sobre TTS
  // autoplay. Subtitulos son un feature de accesibilidad
  // independiente — mantener el default opt-out (TRUE por defecto)
  // evita regresion en usuarios que dependian de ellos.
  const subtitlesEnabled = acc?.subtitles !== false
  const ttsVoice = preferences?.tts_voice || undefined
  // Voice mode gate: master (`voice_enabled`) controla TODO, sub
  // (`voice_mode_enabled`) controla la visibilidad del boton "Hablar"
  // y el acceso a la ruta /voice. Defaults a TRUE para no romper
  // usuarios pre-existentes que aun no pasaron por el nuevo onboarding.
  const voiceEnabled = acc?.voice_enabled !== false
  const voiceModeEnabled = voiceEnabled && acc?.voice_mode_enabled !== false

  const { isRecording, startRecording, stopRecording } = useAudioRecorder()
  const { playTts, stopTts, isMuted, toggleMute } = useTts()
  // Pre-warm Mabel-Gemma4 al montar el chat + POLLING cada 30s para
  // que el chip de estado del header siempre refleje warm/cold/down
  // sin esperar al próximo SEND.
  const llm = useLlmPrewarm({ pollIntervalMs: 30000 })
  // Capa 1 — texto progresivo "Mabel está pensando…" → "despertando…"
  // según los segundos transcurridos desde que arrancó el streaming.
  const streamingElapsed = useElapsedSeconds(isStreaming)
  const { currentWordIndex, startSubtitles, stopSubtitles } = useSubtitles()

  /**
   * Auto-play TTS + subtitles for the latest assistant message, respecting
   * accessibility preferences. Called from every flow that produces an
   * assistant reply (handleSend, handleMicToggle, and the init effect's
   * pendingMessage branch). Centralising this avoids the bug where the
   * landing-composer flow used to render Mabel's first reply silently.
   */
  async function playLastAssistantTtsIfEnabled(): Promise<void> {
    if (!ttsEnabled || isMuted) return
    const msgs = useChatStore.getState().messages
    const lastMsg = msgs[msgs.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return
    const durationMs = await playTts(lastMsg.content, ttsVoice)
    if (durationMs > 0 && subtitlesEnabled) {
      setSubtitleMessageId(lastMsg.id)
      startSubtitles(lastMsg.content, durationMs)
    }
  }

  // Initial-mount strategy (precedence: pendingMessage > check-in greeting > nothing):
  //
  //   (a) If a `pendingMessage` came from Home/sidebar via router state,
  //       send it as the user's first message. Mabel's reply IS the
  //       opening — no separate auto-greeting.
  //
  //   (b) Otherwise, if the session has a completed check-in
  //       (`checkin_completed_at`), fire the greeting endpoint. Mabel will
  //       open by summarizing what she understood from the form (mood,
  //       sleep, focus, note) — empathetic personalised opener.
  //
  //   (c) Otherwise, do nothing. Natural chat: the empty composer waits
  //       for the user to type first. No "fantasma" greeting (ChatGPT-style).
  //
  // `initRef` ensures this block runs at most once per session id, even
  // under React 18 StrictMode (which double-invokes effects in dev).
  useEffect(() => {
    if (!id) return
    if (initRef.current === id) return
    initRef.current = id

    const pendingMessage =
      (location.state as { pendingMessage?: string } | null)?.pendingMessage?.trim() || ''
    // Clear router state so a back/forward navigation doesn't replay the
    // message. Use `navigate(..., { replace: true, state: null })` instead
    // of `window.history.replaceState({}, '')` — the latter wipes React
    // Router's internal `{key, usr}` history entry, which breaks features
    // that key components by `location.key` (scroll restoration, etc.).
    if (pendingMessage) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      })
    }

    // `cancelled` ONLY guards the `navigate('/home')` call inside the catch
    // branch. Why scoped so narrowly: under React 18 StrictMode (dev),
    // mount 1 runs, gets unmounted (cleanup → cancelled=true), then a new
    // mount 2 component is created. Mount 2 has a fresh closure where
    // `cancelled=false` again, but the global `initRef` (also fresh? see
    // below) and Zustand store are shared/persist across remounts. Side
    // effects like `loadMessages` need to keep firing so the messages reach
    // the visible mount; only the navigate-on-failure must be muted to
    // avoid bouncing to /home from a stale closure.
    let cancelled = false

    const run = async () => {
      let session
      try {
        session = await loadSession(id)
      } catch (err) {
        if (cancelled) return // unmounted before the failure surfaced
        console.error('[Chat] loadSession failed for', id, err)
        navigate('/home')
        return
      }

      // From here on, side effects must run regardless of cancelled —
      // they update the global chatStore which is consumed by the live
      // (post-remount) mount of this same Chat route.
      await loadMessages(id)
      const currentMsgs = useChatStore.getState().messages
      if (currentMsgs.length > 0) return // resumed session — nothing to do

      // Guard: sesiones LEGACY (pre-2026-05-23) o huérfanas creadas
      // con `checkin_opt_in=true` pero sin completar el check-in. Si
      // el estudiante entra/re-entra al chat sin mensajes previos y
      // sin pendingMessage del composer, redirigimos al checkin de
      // la propia sesión para que pueda completarlo o saltarlo. Esto
      // resuelve el bug donde una sesión quedaba colgada en estado
      // "chat vacío con greeting placeholder" tras navegar fuera y
      // volver sin haber tocado el formulario.
      if (
        !pendingMessage &&
        session.checkin_opt_in &&
        !session.checkin_completed_at
      ) {
        navigate(`/session/${id}/checkin`, { replace: true })
        return
      }

      // (a) Pending message wins — Mabel's reply will be the opener.
      if (pendingMessage) {
        setAwaitingFirstResponse(true)
        try {
          await sendMessage(id, pendingMessage)
          // Auto-play TTS+subtitles for the first reply, same as the
          // typed/voice paths. Without this the landing-composer flow
          // rendered Mabel's first reply silently for users with audio
          // enabled.
          await playLastAssistantTtsIfEnabled()
        } catch (err) {
          // code-review #7 (2026-05-23): NO silenciar el error del
          // primer mensaje — es el momento de mayor expectativa
          // emocional. Si console.error solo, el usuario queda
          // mirando el landing vacio para siempre sin pista de que
          // pasó. Toast + composer re-habilitado para que pueda
          // re-intentar manualmente.
          console.error('[Chat] sendMessage(pending) failed', err)
          addToast({
            type: 'error',
            message:
              'No pudimos enviar tu mensaje. Intenta escribirlo de nuevo abajo.',
          })
        } finally {
          setAwaitingFirstResponse(false)
        }
        return
      }

      // (b) Check-in completed → personalised greeting that summarizes
      // the form. Mientras el POST /greeting está en vuelo, marcamos
      // `awaitingFirstResponse=true` para que el render muestre
      // typing indicator + composer deshabilitado en lugar del
      // landing vacío "Estoy aquí, escuchándote".
      if (session.checkin_completed_at) {
        setAwaitingFirstResponse(true)
        try {
          const res = await apiClient.post(`/sessions/${id}/greeting`)
          if (res.data.greeting) {
            await loadMessages(id)
            await playLastAssistantTtsIfEnabled()
          }
        } catch (err) {
          // code-review #7: mismo razonamiento que rama (a). Toast +
          // composer habilitado para que el estudiante pueda iniciar
          // la conversacion manualmente si Mabel falló al saludar.
          console.error('[Chat] greeting failed', err)
          addToast({
            type: 'error',
            message:
              'Mabel no pudo iniciar el saludo. Escríbele un mensaje para comenzar.',
          })
        } finally {
          setAwaitingFirstResponse(false)
        }
        return
      }

      // (c) Natural chat — empty composer awaits user input.
    }
    void run()

    // Restore draft from localStorage (saved on JWT expiration)
    const draft = localStorage.getItem('mabel_draft')
    if (draft) {
      setInput(draft)
      localStorage.removeItem('mabel_draft')
      addToast({ type: 'info', message: 'Tu borrador fue recuperado' })
    }

    return () => {
      cancelled = true
    }
  }, [id, loadSession, loadMessages, sendMessage, navigate, addToast, location.state])

  useEffect(() => {
    if (!isLoadingMessages && messages.length > 0) {
      loadReportedIds(messages).then((ids) => {
        if (ids.size > 0) setReportedIds(ids)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingMessages, messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // PRESERVED: Crisis automatica — riskDetected triggers SOS + stops audio/TTS/subtitles.
  const riskDetected = useChatStore((s) => s.riskDetected)
  useEffect(() => {
    if (riskDetected) {
      window.speechSynthesis?.cancel()
      document.querySelectorAll('audio').forEach((a) => a.pause())
      stopTts()
      stopSubtitles()
      setShowSos(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskDetected])

  // Close more-menu on outside click.
  useEffect(() => {
    if (!moreMenuOpen) return
    function onClick(e: MouseEvent) {
      if (!moreMenuRef.current?.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [moreMenuOpen])

  async function handleSend() {
    if (!input.trim() || !id || isStreaming) return
    const text = input.trim()
    setInput('')
    // Capa 2 — toast informativo si el LLM está cold O 'unknown' al
    // momento del SEND. 'unknown' = el primer health check aún no
    // resolvió (típico cuando user llega y tipea rápido); el estado
    // real puede ser cold y sin este aviso la persona espera 60-90s
    // sin saber por qué. Audit 2026-05-24.
    if (llm.status === 'cold' || llm.status === 'unknown') {
      addToast({
        type: 'warning',
        message:
          llm.status === 'cold'
            ? 'Mabel está despertando del descanso — tu respuesta puede tardar 60-90 s, pero ya está procesándose.'
            : 'Verificando estado de Mabel — si está despertando, esto puede tardar hasta un minuto.',
      })
    }
    try {
      await sendMessage(id, text)
      await playLastAssistantTtsIfEnabled()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al enviar mensaje'
      addToast({ type: 'error', message: msg })
    }
  }

  async function handleEndSession() {
    if (!id) return
    try {
      await endSession(id)
      setShowEndModal(false)
      navigate(`/session/${id}/end`)
    } catch {
      addToast({ type: 'error', message: 'Error al finalizar sesion' })
    }
  }

  // PRESERVED: ASR mic toggle — record/stop, transcribe, send, auto-play TTS.
  async function handleMicToggle() {
    if (isRecording) {
      setIsProcessingAudio(true)
      try {
        const blob = await stopRecording()
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        if (id) formData.append('session_id', id)
        const res = await apiClient.post('/asr/transcribe', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const text = res.data.text as string
        if (text && id) {
          await sendMessage(id, text)
          await playLastAssistantTtsIfEnabled()
        }
      } catch {
        addToast({ type: 'error', message: 'Error al transcribir audio' })
      } finally {
        setIsProcessingAudio(false)
      }
    } else {
      await startRecording()
    }
  }

  function handleReportDone(messageId: string) {
    setReportedIds((prev) => new Set(prev).add(messageId))
    setReportMessageId(null)
  }

  async function handleCopy(content: string) {
    try {
      await navigator.clipboard.writeText(content)
      addToast({ type: 'success', message: 'Mensaje copiado' })
    } catch {
      addToast({ type: 'error', message: 'No se pudo copiar' })
    }
  }

  const hasMessages = messages.length > 0 || !!streamingText
  const lastMessageIndex = messages.length - 1
  const sessionTitle = currentSession?.topic_hint?.trim() || 'Conversación'
  const sessionEnded = !!currentSession?.ended_at

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Heart rating ribbon — solo visible cuando la sesion está
          finalizada. Aparece encima del header del chat para invitar
          a calificar la conversacion. Editable indefinidamente: el
          estudiante puede ajustar su calificacion al releer la
          sesion en cualquier momento. */}
      {sessionEnded && id && <HeartRating sessionId={id} />}

      {/* Session header bar */}
      <div
        className="mobile-fab-safe-left"
        style={{
          padding: '14px 24px',
          borderBottom: '1px solid var(--ink-200)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--ink-900)',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 360,
            }}
            title={sessionTitle}
          >
            {sessionTitle}
          </div>
          {!sessionEnded && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: 'var(--success-700)',
                background: 'var(--success-50)',
                padding: '2px 8px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--success-600)',
                }}
              />
              Activa
            </span>
          )}
        </div>

        {/* Right-side controls: estado LLM + SOS + voz + context + menú */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Capa 4 — chip de estado del LLM (warm/cold/down/unknown).
              Se actualiza por polling cada 30 s desde useLlmPrewarm. El
              usuario siempre sabe si Mabel responderá rápido o si va a
              cold-startar sin tener que enviar un mensaje primero. */}
          <LlmStatusChip status={llm.status} />

          {/* SOS — crisis access pill, always visible in header */}
          <SosButton onClick={openCrisis} />

          {/* Modo voz — abre la pantalla de avatar 2D animado. Solo
              visible en sesiones activas (terminadas son read-only) Y
              cuando el usuario tiene voz + modo voz habilitados en sus
              preferencias. */}
          {!sessionEnded && id && voiceModeEnabled && (
            <button
              type="button"
              onClick={() => navigate(`/session/${id}/voice`)}
              title="Hablar con Mabel (modo voz)"
              aria-label="Hablar con Mabel"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'var(--mabel-50)',
                border: '1px solid var(--mabel-200)',
                color: 'var(--mabel-700)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--mabel-100)'
                e.currentTarget.style.borderColor = 'var(--mabel-300)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--mabel-50)'
                e.currentTarget.style.borderColor = 'var(--mabel-200)'
              }}
            >
              <Mic size={13} strokeWidth={2.25} />
              <span>Hablar</span>
            </button>
          )}

          {/* Info / contexto inicial — muestra el checkin_payload de la sesión */}
          <CheckinContextPopover
            payload={currentSession?.checkin_payload ?? null}
            completedAt={currentSession?.checkin_completed_at ?? null}
            startedAt={currentSession?.started_at ?? null}
          />

        {/* More menu (Finalizar sesion lives here) */}
        <div ref={moreMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            title="Más opciones"
            aria-label="Más opciones"
            aria-expanded={moreMenuOpen}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = 'var(--ink-100)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = 'transparent')
            }
          >
            <MoreVertical size={16} />
          </button>

          {moreMenuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                minWidth: 200,
                background: '#fff',
                border: '1px solid var(--ink-200)',
                borderRadius: 12,
                boxShadow: 'var(--shadow-lg)',
                padding: 6,
                zIndex: 30,
              }}
              className="scale-in"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false)
                  setShowEndModal(true)
                }}
                disabled={sessionEnded}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  fontSize: 13.5,
                  color: sessionEnded
                    ? 'var(--ink-400)'
                    : 'var(--mabel-700)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: sessionEnded ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  if (!sessionEnded)
                    e.currentTarget.style.background = 'var(--mabel-50)'
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                Finalizar sesión
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 12px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {isLoadingMessages ? (
            <SkeletonChat />
          ) : !hasMessages && awaitingFirstResponse ? (
            // Typing indicator durante el "primera respuesta" — cubre
            // el gap entre submit del check-in (o envio del primer
            // mensaje del Home) y la primera burbuja de Mabel.
            // Reusa la estetica de la burbuja vacia + dots animados
            // del flow streaming normal (ver `isStreaming && !streamingText`
            // mas abajo) para no introducir un patron visual nuevo.
            <div
              className="fade-in"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                marginTop: 24,
              }}
            >
              <UmbAvatar size={32} style={{ marginTop: 2 }} />
              <StreamingIndicator
                elapsedSeconds={streamingElapsed}
                hasFirstToken={!!streamingText}
                variant="card"
              />
            </div>
          ) : !hasMessages ? (
            <div
              className="fade-in"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '40vh',
                textAlign: 'center',
              }}
            >
              <UmbAvatar size={48} style={{ marginBottom: 16 }} />
              <p
                style={{
                  fontSize: 20,
                  color: 'var(--ink-900)',
                  marginBottom: 4,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Estoy aquí, escuchándote
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
                Cuéntame, ¿cómo te sientes hoy?
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const isAssistant = msg.role === 'assistant'
                const isReported = reportedIds.has(msg.id)
                const isLastStreaming =
                  isStreaming && idx === lastMessageIndex && isAssistant
                const subtitlesActive =
                  isAssistant &&
                  subtitleMessageId === msg.id &&
                  currentWordIndex >= 0

                if (isUser) {
                  // USER bubble — red, asymmetric corners "18 18 4 18", no avatar
                  return (
                    <div
                      key={msg.id}
                      className="group fade-up"
                      style={{
                        display: 'flex',
                        gap: 12,
                        marginBottom: 22,
                        flexDirection: 'row-reverse',
                        alignItems: 'flex-start',
                        animationDelay: `${Math.min(idx * 30, 600)}ms`,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 'min(560px, 75%)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            padding: '11px 15px',
                            borderRadius: '18px 18px 4px 18px',
                            background: 'var(--mabel-600)',
                            color: '#fff',
                            boxShadow: 'var(--shadow-xs)',
                            fontSize: 14.5,
                            lineHeight: 1.55,
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
                            marginTop: 5,
                            paddingInline: 4,
                          }}
                        >
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  )
                }

                // ASSISTANT — white bubble, asymmetric corners "4 18 18 18", avatar LEFT
                return (
                  <div
                    key={msg.id}
                    className="group fade-up"
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginBottom: 22,
                      alignItems: 'flex-start',
                      animationDelay: `${Math.min(idx * 30, 600)}ms`,
                    }}
                  >
                    <AssistantAvatar />
                    <div
                      style={{
                        maxWidth: 'min(560px, 75%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          padding: '11px 15px',
                          borderRadius: '4px 18px 18px 18px',
                          background: '#fff',
                          border: '1px solid var(--ink-200)',
                          color: 'var(--ink-900)',
                          boxShadow: 'var(--shadow-xs)',
                          fontSize: 14.5,
                          lineHeight: 1.55,
                          wordBreak: 'break-word',
                        }}
                      >
                        {subtitlesActive ? (
                          /* PRESERVED: word-by-word subtitle highlighting */
                          <p
                            style={{
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {msg.content.split(/\s+/).map((word, i) => (
                              <span
                                key={i}
                                style={{
                                  background:
                                    i === currentWordIndex
                                      ? 'var(--mabel-100)'
                                      : 'transparent',
                                  borderRadius: 4,
                                  padding: '0 2px',
                                  transition:
                                    'background var(--dur-fast) var(--ease-out)',
                                }}
                              >
                                {i > 0 ? ' ' : ''}
                                {word}
                              </span>
                            ))}
                          </p>
                        ) : (
                          <Markdown text={msg.content} />
                        )}
                        {isLastStreaming && (
                          <span
                            aria-hidden="true"
                            className="animate-pulse"
                            style={{
                              display: 'inline-block',
                              width: 7,
                              height: 15,
                              background: 'var(--mabel-600)',
                              marginLeft: 4,
                              marginBottom: -2,
                              verticalAlign: 'middle',
                            }}
                          />
                        )}
                      </div>

                      {/* Timestamp + reported badge + hover actions */}
                      {!isLastStreaming && msg.content && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginTop: 5,
                            paddingInline: 4,
                            minHeight: 22,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--ink-400)',
                            }}
                          >
                            {formatTime(msg.created_at)}
                          </span>
                          {isReported && (
                            <span
                              style={{
                                fontSize: 10.5,
                                color: 'var(--ink-500)',
                                fontStyle: 'italic',
                              }}
                            >
                              Ya reportado
                            </span>
                          )}
                          <div
                            className="opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                            style={{
                              display: 'flex',
                              gap: 4,
                              transition: 'opacity var(--dur-fast)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.content)}
                              title="Copiar"
                              aria-label="Copiar mensaje"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--ink-400)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition:
                                  'all var(--dur-fast) var(--ease-out)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                  'var(--ink-100)'
                                e.currentTarget.style.color = 'var(--ink-700)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--ink-400)'
                              }}
                            >
                              <Copy size={13} />
                            </button>
                            {!isReported && (
                              <button
                                type="button"
                                onClick={() => setReportMessageId(msg.id)}
                                title="Reportar mensaje"
                                aria-label="Reportar mensaje"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--ink-400)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  transition:
                                    'all var(--dur-fast) var(--ease-out)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    'var(--ink-100)'
                                  e.currentTarget.style.color =
                                    'var(--danger-600)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background =
                                    'transparent'
                                  e.currentTarget.style.color = 'var(--ink-400)'
                                }}
                              >
                                <Flag size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Streaming preview when tokens accumulating but no message added yet */}
              {isStreaming && streamingText && (
                <div
                  className="group fade-up"
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 22,
                    alignItems: 'flex-start',
                  }}
                >
                  <AssistantAvatar />
                  <div
                    style={{
                      maxWidth: 'min(560px, 75%)',
                      padding: '11px 15px',
                      borderRadius: '4px 18px 18px 18px',
                      background: '#fff',
                      border: '1px solid var(--ink-200)',
                      color: 'var(--ink-900)',
                      boxShadow: 'var(--shadow-xs)',
                      fontSize: 14.5,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {streamingText}
                    <span
                      aria-hidden="true"
                      className="animate-pulse"
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 15,
                        background: 'var(--mabel-600)',
                        marginLeft: 4,
                        marginBottom: -2,
                        verticalAlign: 'middle',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Typing indicator — streaming started but no token yet */}
              {isStreaming && !streamingText && (
                <div
                  className="fade-in"
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginBottom: 22,
                    alignItems: 'flex-start',
                  }}
                >
                  <AssistantAvatar />
                  <StreamingIndicator
                    elapsedSeconds={streamingElapsed}
                    hasFirstToken={!!streamingText}
                    variant="inline"
                  />
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Composer + disclaimer footer */}
      <div
        style={{
          padding: '0 24px 20px',
          background: 'var(--ink-50)',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Banner discreto cuando Mabel-Gemma4 está cold en Modal.
              El usuario sigue pudiendo escribir; el indicador solo le
              avisa que la primera respuesta puede tardar más de lo
              normal (60-90s vs ~3s). Se autoesconde una vez warm. */}
          {llm.status === 'cold' && (
            <div
              style={{
                marginBottom: 8,
                padding: '8px 12px',
                background: 'var(--warn-50)',
                color: 'var(--warn-700)',
                border: '1px solid var(--warn-200)',
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--warn-600)',
                  animation: 'blink 1.2s ease-in-out infinite',
                }}
              />
              Mabel está despertando — la primera respuesta puede tardar
              hasta un minuto.
            </div>
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            // Bloqueamos el input tambien durante `awaitingFirstResponse`
            // (greeting post check-in o primera respuesta al
            // pendingMessage) para que el estudiante no encole un
            // mensaje encima del saludo de Mabel — feedback UX
            // 2026-05-23.
            disabled={
              isStreaming || isRecording || sessionEnded || awaitingFirstResponse
            }
            isRecording={isRecording}
            onMicToggle={handleMicToggle}
            isProcessingAudio={isProcessingAudio}
            ttsEnabled={ttsEnabled}
            isMuted={isMuted}
            onMuteToggle={toggleMute}
            maxLength={2000}
            showHint
            placeholder={
              awaitingFirstResponse
                ? 'Mabel está escribiendo el primer mensaje…'
                : 'Cuéntame qué necesitas hoy…'
            }
          />
          <div
            style={{
              textAlign: 'center',
              marginTop: 12,
              fontSize: 12,
              color: 'var(--ink-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Lock size={12} />
            <span>
              Mabel es psicoeducativa. No reemplaza atención profesional.
              Líneas de ayuda disponibles vía SOS.
            </span>
          </div>
        </div>
      </div>

      {/* PRESERVED: End session modal */}
      <ConfirmModal
        open={showEndModal}
        title="¿Finalizar sesión?"
        message="Podras ver esta conversacion en tu historial."
        confirmLabel="Finalizar"
        onConfirm={handleEndSession}
        onCancel={() => setShowEndModal(false)}
      />

      {/* PRESERVED: Report modal */}
      {reportMessageId && (
        <ReportModal
          messageId={reportMessageId}
          onClose={() => setReportMessageId(null)}
          onReported={handleReportDone}
        />
      )}

      {/* PRESERVED: SOS Panel — auto or manual activation */}
      <SosPanel
        open={showSos}
        trigger={riskDetected ? 'auto' : 'manual'}
        sessionId={id}
        onClose={() => {
          setShowSos(false)
          useChatStore.getState().clearRisk()
        }}
      />
    </div>
  )
}
