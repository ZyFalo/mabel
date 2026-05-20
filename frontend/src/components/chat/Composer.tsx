import { useEffect, useRef, useState } from 'react'
import {
  Paperclip,
  Mic,
  Loader2,
  Volume2,
  VolumeX,
  ArrowRight,
} from 'lucide-react'

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
 * Composer — Cap 6.3, prototype-styled composer card.
 *
 * Card: white bg, 20px radius, ink-200 border (focused mabel-300 + ring-mabel),
 * shadow-sm, padding 14px 16px 10px.
 *
 * Bottom row:
 *  - LEFT: Paperclip (placeholder) + Mic (ASR) + Mute (TTS) — 34×34 buttons
 *  - RIGHT: hint "↵ para enviar" + circular Send button (ArrowRight, mabel-600)
 *
 * Preserves verbatim:
 *  - Mic ASR pulsing red border `animate-pulse + 2px #DC2626` while recording
 *  - Mute TTS toggle (only when ttsEnabled === true)
 *  - Enter to send, Shift+Enter newline
 *  - 2000-char default cap
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
  placeholder = 'Cuéntame qué necesitas hoy…',
  maxLength = 2000,
  showHint = true,
  autoFocus = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)

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
  const canSend = !!value.trim() && !disabled
  const charsNearMax = value.length > maxLength - 100

  // Reusable subtle icon button styles for LEFT-row buttons (34×34 ghost).
  const ghostBtnBase: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--ink-500)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all var(--dur-fast) var(--ease-out)',
  }

  function ghostHoverEnter(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.background = 'var(--ink-100)'
    e.currentTarget.style.color = 'var(--ink-800)'
  }
  function ghostHoverLeave(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--ink-500)'
  }

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          background: '#fff',
          border: `1px solid ${focused ? 'var(--mabel-300)' : 'var(--ink-200)'}`,
          borderRadius: 20,
          boxShadow: focused
            ? 'var(--ring-mabel), var(--shadow-sm)'
            : 'var(--shadow-sm)',
          padding: '14px 16px 10px',
          transition: 'all var(--dur-base) var(--ease-out)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          maxLength={maxLength}
          rows={1}
          placeholder={placeholder}
          aria-label="Mensaje para Mabel"
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.5,
            color: 'var(--ink-900)',
            background: 'transparent',
            minHeight: 28,
            maxHeight: MAX_TEXTAREA_HEIGHT,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
          }}
        >
          {/* LEFT — Paperclip (placeholder), Mic (ASR), Mute (TTS) */}
          <div style={{ display: 'flex', gap: 4 }}>
            {/* Paperclip placeholder — visual only, deferred attachment feature */}
            <button
              type="button"
              title="Adjuntar"
              aria-label="Adjuntar"
              disabled
              style={{
                ...ghostBtnBase,
                cursor: 'not-allowed',
                opacity: 0.6,
              }}
            >
              <Paperclip size={17} />
            </button>

            {/* Mic (ASR) — pulsing red border when recording (PRESERVED) */}
            {showMic && (
              <button
                type="button"
                onClick={() => onMicToggle?.()}
                disabled={disabled || isProcessingAudio}
                title={isRecording ? 'Detener grabacion' : 'Grabar audio'}
                aria-label={isRecording ? 'Detener grabacion' : 'Grabar audio'}
                aria-pressed={isRecording}
                className={isRecording ? 'animate-pulse' : ''}
                style={
                  isRecording
                    ? {
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: '#fff',
                        color: '#DC2626',
                        border: '2px solid #DC2626',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    : isProcessingAudio
                      ? {
                          ...ghostBtnBase,
                          cursor: 'wait',
                          color: 'var(--ink-400)',
                        }
                      : {
                          ...ghostBtnBase,
                          opacity: disabled ? 0.5 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }
                }
                onMouseEnter={(e) => {
                  if (isRecording || isProcessingAudio || disabled) return
                  ghostHoverEnter(e)
                }}
                onMouseLeave={(e) => {
                  if (isRecording || isProcessingAudio || disabled) return
                  ghostHoverLeave(e)
                }}
              >
                {isProcessingAudio ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Mic size={17} />
                )}
              </button>
            )}

            {/* Mute (TTS) — only when TTS enabled */}
            {showMute && (
              <button
                type="button"
                onClick={onMuteToggle}
                title={isMuted ? 'Activar TTS' : 'Silenciar TTS'}
                aria-label={isMuted ? 'Activar TTS' : 'Silenciar TTS'}
                aria-pressed={isMuted}
                style={ghostBtnBase}
                onMouseEnter={ghostHoverEnter}
                onMouseLeave={ghostHoverLeave}
              >
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
            )}
          </div>

          {/* RIGHT — hint + circular Send */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {showHint && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--ink-400)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                className="hidden sm:inline"
              >
                <span style={{ fontFamily: 'var(--font-ui)' }}>⏎</span> para enviar
              </span>
            )}

            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Enviar mensaje"
              title="Enviar"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: canSend ? 'var(--mabel-600)' : 'var(--ink-200)',
                color: '#fff',
                border: 'none',
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background var(--dur-fast) var(--ease-out)',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (canSend) e.currentTarget.style.background = 'var(--mabel-700)'
              }}
              onMouseLeave={(e) => {
                if (canSend) e.currentTarget.style.background = 'var(--mabel-600)'
              }}
            >
              <ArrowRight size={16} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>

      {/* Optional inline char counter only when near limit. */}
      {charsNearMax && (
        <p
          style={{
            fontSize: 11,
            color: 'var(--ink-500)',
            textAlign: 'right',
            marginTop: 6,
          }}
        >
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  )
}
