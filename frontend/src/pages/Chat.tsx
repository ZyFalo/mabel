import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import apiClient from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import { useToastStore } from '../stores/toastStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import ConfirmModal from '../components/ui/ConfirmModal'
import ReportModal from '../components/chat/ReportModal'
import SosPanel from '../components/sos/SosPanel'
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
  const user = useAuthStore((s) => s.user)
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

  useEffect(() => {
    if (!id) return
    loadSession(id).catch(() => navigate('/home'))
    loadMessages(id).then(() => {
      // Request auto-greeting if no messages exist yet
      const currentMsgs = useChatStore.getState().messages
      if (currentMsgs.length === 0) {
        apiClient
          .post(`/sessions/${id}/greeting`)
          .then((res) => {
            if (res.data.greeting) {
              // Reload messages to show the greeting
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

  // Handle risk detection from chatStore
  const riskDetected = useChatStore((s) => s.riskDetected)
  useEffect(() => {
    if (riskDetected) {
      // Stop any playing audio (TTS) before opening SOS
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
      // Auto-play TTS after assistant response
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
          // Auto-play TTS after ASR-triggered response
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

  const hasMessages = messages.length > 0 || streamingText

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-sm text-text-primary/60">Conversacion en curso</span>
        <button
          onClick={() => setShowEndModal(true)}
          className="text-xs text-text-primary/50 hover:text-danger transition-colors"
        >
          Finalizar sesion
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoadingMessages ? (
          <SkeletonChat />
        ) : !hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-lg text-text-primary mb-1">
              Hola, {user?.display_name || 'estudiante'}!
            </p>
            <p className="text-sm text-text-primary/60">Cuentame, como te sientes hoy?</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl mx-auto">
            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              const isAssistant = msg.role === 'assistant'
              const isReported = reportedIds.has(msg.id)
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      isUser
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-gray-100 text-text-primary rounded-bl-md'
                    }`}
                  >
                    {isAssistant && subtitleMessageId === msg.id && currentWordIndex >= 0 ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content.split(/\s+/).map((word, i) => (
                          <span
                            key={i}
                            className={i === currentWordIndex ? 'bg-primary/20 rounded px-0.5' : ''}
                          >
                            {i > 0 ? ' ' : ''}{word}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <span
                        className={`text-[10px] ${
                          isUser ? 'text-white/60' : 'text-text-primary/40'
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </span>
                      {isAssistant && (
                        isReported ? (
                          <span className="text-[10px] text-text-primary/40">Ya reportado</span>
                        ) : (
                          <button
                            onClick={() => setReportMessageId(msg.id)}
                            className="text-text-primary/30 hover:text-danger transition-colors"
                            title="Reportar mensaje"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Streaming bubble */}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-gray-100 text-text-primary px-4 py-2.5">
                  <p className="text-sm whitespace-pre-wrap">{streamingText}</p>
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {isStreaming && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-text-primary/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-text-primary/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-text-primary/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          {/* Mute toggle */}
          {ttsEnabled && (
            <button
              onClick={toggleMute}
              className="px-2 py-2.5 text-text-primary/50 hover:text-text-primary transition-colors shrink-0"
              title={isMuted ? 'Activar TTS' : 'Silenciar TTS'}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={handleKeyDown}
            disabled={isStreaming || isRecording}
            maxLength={2000}
            rows={1}
            placeholder="Escribe un mensaje..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
          {/* Microphone button */}
          <button
            onClick={handleMicToggle}
            disabled={isStreaming || isProcessingAudio}
            className={`px-3 py-2.5 rounded-xl transition-all shrink-0 ${
              isRecording
                ? 'bg-white border-2 border-[#DC2626] text-[#DC2626] animate-pulse'
                : isProcessingAudio
                  ? 'bg-gray-100 text-text-primary/40'
                  : 'bg-gray-100 text-text-primary/60 hover:bg-gray-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isRecording ? 'Detener grabacion' : 'Grabar audio'}
          >
            {isProcessingAudio ? (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
              </svg>
            )}
          </button>
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || input.length > 2000 || isStreaming}
            className="px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {input.length > 1900 && (
          <p className="text-xs text-text-primary/40 text-right mt-1 max-w-2xl mx-auto">
            {input.length}/2000
          </p>
        )}
      </div>

      {/* End session modal */}
      <ConfirmModal
        open={showEndModal}
        title="Finalizar sesion?"
        message="Podras ver esta conversacion en tu historial."
        confirmLabel="Finalizar"
        onConfirm={handleEndSession}
        onCancel={() => setShowEndModal(false)}
      />

      {/* Report modal */}
      {reportMessageId && (
        <ReportModal
          messageId={reportMessageId}
          onClose={() => setReportMessageId(null)}
          onReported={handleReportDone}
        />
      )}

      {/* SOS Panel — auto or manual activation */}
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
