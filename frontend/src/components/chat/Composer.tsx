import { useEffect, useRef } from 'react'
import { Send, Mic, Square, Loader2, Volume2, VolumeX } from 'lucide-react'

interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  isRecording?: boolean
  onMicToggle?: () => Promise<void> | void
  isProcessingAudio?: boolean
  ttsEnabled?: boolean
  isMuted?: boolean
  onMuteToggle?: () => void
  placeholder?: string
  maxLength?: number
  showHint?: boolean
  autoFocus?: boolean
}

const MAX_TEXTAREA_HEIGHT = 200

/**
 * Composer — Cap 3, floating card composer with mic/mute/send controls.
 *
 * Preserves verbatim:
 * - Mic ASR pulsing red border `animate-pulse border-2 border-[#DC2626]` while recording
 * - Mute TTS toggle (only when ttsEnabled === true)
 * - Enter to send, Shift+Enter newline
 * - 2000-char default cap
 */
export default function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  isRecording = false,
  onMicToggle,
  isProcessingAudio = false,
  ttsEnabled = false,
  isMuted = false,
  onMuteToggle,
  placeholder = 'Escribe un mensaje...',
  maxLength = 2000,
  showHint = true,
  autoFocus = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textarea up to MAX_TEXTAREA_HEIGHT.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSend()
    }
  }

  const showMic = typeof onMicToggle === 'function'
  const showMute = ttsEnabled && typeof onMuteToggle === 'function'
  const charsNearMax = value.length > maxLength - 100

  return (
    <div className="w-full">
      <div
        className="
          group/composer
          bg-[#fff]
          border border-[var(--ink-200)]
          rounded-[22px]
          shadow-sm
          transition-all duration-200
          focus-within:border-[var(--mabel-600)]/60
          focus-within:shadow-[0_2px_24px_-6px_var(--ring-mabel)]
        "
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          maxLength={maxLength}
          rows={1}
          placeholder={placeholder}
          aria-label="Mensaje para Mabel"
          className="
            w-full resize-none
            bg-transparent
            text-[var(--ink-900)]
            placeholder:text-[var(--ink-400)]
            px-5 pt-4 pb-2
            text-[15px] leading-relaxed
            outline-none
            disabled:opacity-60 disabled:cursor-not-allowed
          "
          style={{ maxHeight: `${MAX_TEXTAREA_HEIGHT}px` }}
        />

        <div className="flex items-center justify-between px-3 pb-2.5">
          {/* LEFT — Mic + Mute */}
          <div className="flex items-center gap-1">
            {showMic && (
              <button
                type="button"
                onClick={() => onMicToggle?.()}
                disabled={disabled || isProcessingAudio}
                title={isRecording ? 'Detener grabacion' : 'Grabar audio'}
                aria-label={isRecording ? 'Detener grabacion' : 'Grabar audio'}
                aria-pressed={isRecording}
                className={
                  isRecording
                    ? 'flex items-center justify-center w-9 h-9 rounded-lg bg-white border-2 border-[#DC2626] text-[#DC2626] animate-pulse'
                    : isProcessingAudio
                      ? 'flex items-center justify-center w-9 h-9 rounded-lg text-[var(--ink-400)]'
                      : 'flex items-center justify-center w-9 h-9 rounded-lg text-[var(--ink-400)] hover:text-[var(--ink-700)] hover:bg-[var(--ink-100)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                {isProcessingAudio ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : isRecording ? (
                  <Square size={15} fill="currentColor" />
                ) : (
                  <Mic size={17} />
                )}
              </button>
            )}

            {showMute && (
              <button
                type="button"
                onClick={onMuteToggle}
                title={isMuted ? 'Activar TTS' : 'Silenciar TTS'}
                aria-label={isMuted ? 'Activar TTS' : 'Silenciar TTS'}
                aria-pressed={isMuted}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-[var(--ink-400)] hover:text-[var(--ink-700)] hover:bg-[var(--ink-100)] transition-colors"
              >
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>

          {/* RIGHT — Send */}
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim() || disabled}
            aria-label="Enviar mensaje"
            title="Enviar"
            className="
              flex items-center justify-center
              p-2 rounded-lg
              bg-[var(--mabel-600)] text-white
              hover:opacity-90 active:opacity-100
              transition-opacity
              disabled:bg-[var(--ink-300)] disabled:text-[var(--ink-400)]
              disabled:cursor-not-allowed
            "
          >
            <Send size={17} />
          </button>
        </div>
      </div>

      {showHint && (
        <p className="text-[11px] text-[var(--ink-400)] text-center mt-2 select-none">
          <span className="font-medium">Enter</span> para enviar,{' '}
          <span className="font-medium">Shift+Enter</span> para nueva linea
          {charsNearMax && (
            <span className="ml-2 text-[var(--ink-500)]">
              · {value.length}/{maxLength}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
