import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sparkles, Copy, Flag } from 'lucide-react'
import apiClient from '../api/client'
import { useChatStore } from '../stores/chatStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import ConfirmModal from '../components/ui/ConfirmModal'
import ReportModal from '../components/chat/ReportModal'
import SosPanel from '../components/sos/SosPanel'
import Composer from '../components/chat/Composer'
import ChatTopBar from '../components/chat/TopBar'
import Markdown from '../components/ui/Markdown'
import useAudioRecorder from '../hooks/useAudioRecorder'
import useTts from '../hooks/useTts'
import useSubtitles from '../hooks/useSubtitles'

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

async function loadReportedIds(messages: { id: string; role: string }[]): Promise<Set<string>> {
  const assistantMsgs = messages.filter((m) => m.role === 'assistant')
  if (assistantMsgs.length === 0) return new Set()

  const results = await Promise.allSettled(
    assistantMsgs.map((m) => apiClient.get(`/messages/${m.id}/reports/check`))
  )

  const reported = new Set<string>()
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.data.already_reported) {
      reported.add(assistantMsgs[i].id)
    }
  })
  return reported
}

export default function Chat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    messages,
    isStreaming,
    streamingText,
    isLoadingMessages,
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
  const [subtitleMessageId, setSubtitleMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const preferences = usePreferencesStore((s) => s.preferences)
  const acc = preferences?.accessibility as Record<string, unknown> | null
  const ttsEnabled = acc?.tts_enabled !== false
  const subtitlesEnabled = acc?.subtitles !== false
  const ttsVoice = preferences?.tts_voice || undefined

  const { isRecording, startRecording, stopRecording } = useAudioRecorder()
  const { playTts, stopTts, isMuted, toggleMute } = useTts()
  const { currentWordIndex, startSubtitles, stopSubtitles } = useSubtitles()

  // PRESERVED: Load session, messages, auto-greeting, draft restore.
  useEffect(() => {
    if (!id) return
    loadSession(id).catch(() => navigate('/home'))
    loadMessages(id).then(() => {
      const currentMsgs = useChatStore.getState().messages
      if (currentMsgs.length === 0) {
        apiClient
          .post(`/sessions/${id}/greeting`)
          .then((res) => {
            if (res.data.greeting) {
              loadMessages(id)
            }
          })
          .catch(() => {})
      }
    })
    // Restore draft from localStorage (saved on JWT expiration)
    const draft = localStorage.getItem('mabel_draft')
    if (draft) {
      setInput(draft)
      localStorage.removeItem('mabel_draft')
      addToast({ type: 'info', message: 'Tu borrador fue recuperado' })
    }
  }, [id, loadSession, loadMessages, navigate, addToast])

  useEffect(() => {
    if (!isLoadingMessages && messages.length > 0) {
      loadReportedIds(messages).then((ids) => {
        if (ids.size > 0) setReportedIds(ids)
      })
    }
  }, [isLoadingMessages, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [riskDetected])

  async function handleSend() {
    if (!input.trim() || !id || isStreaming) return
    const text = input.trim()
    setInput('')
    try {
      await sendMessage(id, text)
      // PRESERVED: Auto-play TTS + subtitles after assistant response.
      if (ttsEnabled && !isMuted) {
        const msgs = useChatStore.getState().messages
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          const durationMs = await playTts(lastMsg.content, ttsVoice)
          if (durationMs > 0 && subtitlesEnabled) {
            setSubtitleMessageId(lastMsg.id)
            startSubtitles(lastMsg.content, durationMs)
          }
        }
      }
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
          if (ttsEnabled && !isMuted) {
            const msgs = useChatStore.getState().messages
            const lastMsg = msgs[msgs.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              const durationMs = await playTts(lastMsg.content, ttsVoice)
              if (durationMs > 0 && subtitlesEnabled) {
                setSubtitleMessageId(lastMsg.id)
                startSubtitles(lastMsg.content, durationMs)
              }
            }
          }
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

  return (
    <div className="flex flex-col h-full">
      <ChatTopBar onEndSession={() => setShowEndModal(true)} />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          {isLoadingMessages ? (
            <SkeletonChat />
          ) : !hasMessages ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center fade-in">
              <div
                className="w-10 h-10 rounded-full bg-[#fff] border border-[var(--ink-200)] flex items-center justify-center text-[var(--mabel-600)] mb-4"
                aria-hidden="true"
              >
                <Sparkles size={16} />
              </div>
              <p className="font-display italic text-[20px] text-[var(--ink-900)] mb-1">
                Estoy aqui, escuchandote
              </p>
              <p className="text-[13px] text-[var(--ink-400)]">
                Cuentame, como te sientes hoy?
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

                return (
                  <div
                    key={msg.id}
                    className="group fade-up"
                    style={{ animationDelay: `${Math.min(idx * 30, 600)}ms` }}
                  >
                    {isUser ? (
                      /* USER message — right-aligned bubble */
                      <div className="flex flex-col items-end">
                        <div
                          className="
                            max-w-[90%] sm:max-w-[85%] md:max-w-[80%]
                            bg-[var(--ink-100)]
                            text-[var(--ink-900)]
                            px-4 py-2.5
                            rounded-2xl rounded-br-md
                            text-[14.5px] leading-relaxed
                            whitespace-pre-wrap
                            shadow-[0_1px_0_rgba(0,0,0,0.02)]
                          "
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-[var(--ink-400)] mt-1 mr-1">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    ) : (
                      /* ASSISTANT message — full-width with avatar, no bubble */
                      <div className="flex gap-4">
                        <div className="shrink-0 mt-1">
                          <div
                            className="
                              w-7 h-7 rounded-full
                              bg-[#fff]
                              border border-[var(--ink-200)]
                              flex items-center justify-center
                              text-[var(--mabel-600)]
                            "
                            aria-hidden="true"
                          >
                            <Sparkles size={13} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="text-[15px] text-[var(--ink-900)] leading-relaxed">
                            {subtitlesActive ? (
                              /* PRESERVED: word-by-word subtitle highlighting */
                              <p className="whitespace-pre-wrap">
                                {msg.content.split(/\s+/).map((word, i) => (
                                  <span
                                    key={i}
                                    className={
                                      i === currentWordIndex
                                        ? 'bg-[var(--mabel-600)]/20 rounded px-0.5'
                                        : ''
                                    }
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
                                className="inline-block w-[7px] h-[15px] bg-[var(--mabel-600)] ml-1 -mb-0.5 align-middle animate-pulse"
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          {/* Action row — visible "Ya reportado" badge always, hover-revealed buttons */}
                          {!isLastStreaming && msg.content && (
                            <div className="flex items-center gap-2 mt-3 min-h-[24px]">
                              {/* Persistent badge */}
                              {isReported && (
                                <span className="text-[10px] uppercase tracking-wider text-[var(--ink-400)] px-1.5 py-0.5 rounded border border-[var(--ink-100)]">
                                  Ya reportado
                                </span>
                              )}
                              {/* Hover-revealed buttons */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(msg.content)}
                                  title="Copiar"
                                  aria-label="Copiar mensaje"
                                  className="p-1.5 rounded-md hover:bg-[var(--ink-100)] text-[var(--ink-400)] hover:text-[var(--ink-700)] transition-colors"
                                >
                                  <Copy size={13} />
                                </button>
                                {!isReported && (
                                  <button
                                    type="button"
                                    onClick={() => setReportMessageId(msg.id)}
                                    title="Reportar mensaje"
                                    aria-label="Reportar mensaje"
                                    className="p-1.5 rounded-md hover:bg-[var(--ink-100)] text-[var(--ink-400)] hover:text-[var(--danger-600)] transition-colors"
                                  >
                                    <Flag size={13} />
                                  </button>
                                )}
                                <span className="ml-1 text-[10px] text-[var(--ink-400)]">
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Streaming preview bubble when the assistant has not yet been
                  added to messages but tokens are accumulating. */}
              {isStreaming && streamingText && (
                <div className="group fade-up">
                  <div className="flex gap-4">
                    <div className="shrink-0 mt-1">
                      <div
                        className="
                          w-7 h-7 rounded-full
                          bg-[#fff]
                          border border-[var(--ink-200)]
                          flex items-center justify-center
                          text-[var(--mabel-600)]
                        "
                        aria-hidden="true"
                      >
                        <Sparkles size={13} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="text-[15px] text-[var(--ink-900)] leading-relaxed whitespace-pre-wrap">
                        {streamingText}
                        <span
                          className="inline-block w-[7px] h-[15px] bg-[var(--mabel-600)] ml-1 -mb-0.5 align-middle animate-pulse"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Typing indicator — only when streaming has started but no token yet */}
              {isStreaming && !streamingText && (
                <div className="flex gap-4 fade-in">
                  <div className="shrink-0 mt-1">
                    <div
                      className="
                        w-7 h-7 rounded-full
                        bg-[#fff]
                        border border-[var(--ink-200)]
                        flex items-center justify-center
                        text-[var(--mabel-600)]
                      "
                      aria-hidden="true"
                    >
                      <Sparkles size={13} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-2">
                    <span
                      className="w-1.5 h-1.5 bg-[var(--ink-400)] rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-[var(--ink-400)] rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-[var(--ink-400)] rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Composer + disclaimer */}
      <div className="px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          <Composer
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={isStreaming || isRecording}
            isRecording={isRecording}
            onMicToggle={handleMicToggle}
            isProcessingAudio={isProcessingAudio}
            ttsEnabled={ttsEnabled}
            isMuted={isMuted}
            onMuteToggle={toggleMute}
            maxLength={2000}
            showHint={false}
          />
          <p className="text-center text-[11px] text-[var(--ink-400)] mt-2.5 px-4 leading-relaxed">
            Mabel es una asistente de psicoeducacion. No reemplaza atencion profesional.
            Lineas de ayuda disponibles via SOS.
          </p>
        </div>
      </div>

      {/* PRESERVED: End session modal */}
      <ConfirmModal
        open={showEndModal}
        title="Finalizar sesion?"
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
