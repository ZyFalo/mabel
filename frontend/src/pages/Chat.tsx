import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'
import { SkeletonChat } from '../components/ui/Skeleton'
import ConfirmModal from '../components/ui/ConfirmModal'
import ReportModal from '../components/chat/ReportModal'

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
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
  const [reportMessageId, setReportMessageId] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    loadSession(id).catch(() => navigate('/home'))
    loadMessages(id)
  }, [id, loadSession, loadMessages, navigate])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  async function handleSend() {
    if (!input.trim() || !id || isStreaming) return
    const text = input.trim()
    setInput('')
    try {
      await sendMessage(id, text)
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
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 2000))}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            maxLength={2000}
            rows={1}
            placeholder="Escribe un mensaje..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
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
    </div>
  )
}
