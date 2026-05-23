/**
 * Voice — Modo conversación por voz con avatar 2D animado de Mabel.
 *
 * Vive dentro del student layout — el sidebar sigue visible para no
 * romper la navegación habitual del estudiante.
 *
 * Flujo:
 *   idle → tap mic → listening (graba) → tap stop →
 *   thinking (ASR + sendMessage SSE; transcript en vivo) →
 *   speaking (TTS reproduce) → idle.
 *
 * El audio del usuario NO se persiste: ASR lo convierte a texto y se
 * envía como mensaje normal. La sesión se comparte con el chat texto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  AlertCircle,
} from 'lucide-react'
// Mic se usa dos veces: en el chip "Voz" del header + en el boton del
// control bar. No quitar el import aunque parezca redundante.
import apiClient from '../api/client'
import { useChatStore } from '../stores/chatStore'
import { useToastStore } from '../stores/toastStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import useAudioRecorder from '../hooks/useAudioRecorder'
import useTts from '../hooks/useTts'
import MabelAvatar, { type AvatarState } from '../components/voice/MabelAvatar'
import ReactiveRings from '../components/voice/ReactiveRings'

export default function Voice() {
  const { id } = useParams()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingText = useChatStore((s) => s.streamingText)
  const loadSession = useChatStore((s) => s.loadSession)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const currentSession = useChatStore((s) => s.currentSession)

  const { isRecording, startRecording, stopRecording, error: micError } =
    useAudioRecorder()
  const { playTts, stopTts, isMuted, toggleMute } = useTts()

  // Route guard: si el usuario llega a /voice con sus preferencias
  // diciendo que NO quiere modo voz (master `voice_enabled` off o
  // sub `voice_mode_enabled` off), lo redirigimos al chat de texto.
  // Defaults a permitir para no romper sesiones legacy.
  const preferences = usePreferencesStore((s) => s.preferences)
  const prefsLoading = usePreferencesStore((s) => s.loading)
  const loadPrefs = usePreferencesStore((s) => s.loadPreferences)
  const accForGate = preferences?.accessibility as Record<string, unknown> | null
  const voiceEnabled = accForGate?.voice_enabled !== false
  const voiceModeEnabled =
    voiceEnabled && accForGate?.voice_mode_enabled !== false

  // Asegura que preferences esten cargadas antes de cualquier mount-side
  // effect (mic init, greeting fetch, etc.). Sin esto, el avatar montaba
  // antes del guard y podia disparar request de permisos del mic en
  // usuarios que tenian voz desactivada — luego se redirigia al chat
  // pero el flash y el prompt nativo ya habian ocurrido.
  useEffect(() => {
    if (!preferences && !prefsLoading) {
      loadPrefs()
    }
  }, [preferences, prefsLoading, loadPrefs])

  useEffect(() => {
    if (!preferences) return // todavia cargando, esperar
    if (!voiceModeEnabled && id) {
      navigate(`/session/${id}/chat`, { replace: true })
    }
  }, [voiceModeEnabled, preferences, id, navigate])

  const [state, setState] = useState<AvatarState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [lastUserText, setLastUserText] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  // Marca cuándo arrancó la grabación actual. Si el usuario para
  // antes de ~800ms el audio es basura (webm vacío que Whisper devuelve
  // como string vacío y nos da 400 inútil), así que lo bloqueamos.
  const recordingStartRef = useRef<number | null>(null)
  const MIN_RECORDING_MS = 800

  // Cleanup: si el usuario sale con TTS reproduciéndose, paramos el audio.
  useEffect(() => {
    return () => stopTts()
  }, [stopTts])

  // Carga inicial sesión + mensajes. Si la sesión tiene check-in pero
  // ningún mensaje todavía (entrada directa a /voice sin pasar antes
  // por /chat), disparamos el greeting con `voice_mode=true` para que
  // suene natural en TTS — sin esto el primer mensaje vendría en
  // formato texto (markdown/emojis) que Piper lee literal.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const session = await loadSession(id)
        if (cancelled) return
        await loadMessages(id)
        if (cancelled) return
        const msgs = useChatStore.getState().messages
        if (msgs.length === 0 && session.checkin_completed_at) {
          try {
            await apiClient.post(
              `/sessions/${id}/greeting?voice_mode=true`,
            )
            if (!cancelled) await loadMessages(id)
          } catch {
            // greeting es best-effort; si falla, la sesion sigue abierta
          }
        }
      } catch {
        if (!cancelled) {
          addToast({ type: 'error', message: 'No se pudo cargar la sesión' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, loadSession, loadMessages, addToast])

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Sincroniza avatar con isStreaming.
  useEffect(() => {
    if (isStreaming) setState('thinking')
  }, [isStreaming])

  // TTS solo para respuestas generadas en este modo (no narrar historial).
  const ttsHandledRef = useRef<Set<string>>(new Set())
  const initialMessagesMarkedRef = useRef(false)

  useEffect(() => {
    if (messages.length === 0) return
    if (initialMessagesMarkedRef.current) return
    messages.forEach((m) => {
      if (m.role === 'assistant') ttsHandledRef.current.add(m.id)
    })
    initialMessagesMarkedRef.current = true
  }, [messages])

  useEffect(() => {
    if (isStreaming || isMuted) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return
    if (last.id.startsWith('temp-')) return
    if (ttsHandledRef.current.has(last.id)) return
    ttsHandledRef.current.add(last.id)
    setState('speaking')
    playTts(last.content)
      .then(() => setState('idle'))
      .catch(() => setState('idle'))
  }, [messages, isStreaming, isMuted, playTts])

  // Errores del mic → estado error.
  useEffect(() => {
    if (micError) {
      setState('error')
      addToast({ type: 'error', message: micError })
    }
  }, [micError, addToast])

  // ── Acciones ──────────────────────────────────────────────────────

  const handleMicToggle = useCallback(async () => {
    if (!id) return

    if (isRecording) {
      // Guard: el usuario soltó muy rápido — webm queda casi vacío y
      // Whisper devuelve string vacío. En vez de ir al backend y
      // cosechar un 400, abortamos local y le decimos qué pasó.
      const elapsedRec = Date.now() - (recordingStartRef.current ?? 0)
      if (elapsedRec < MIN_RECORDING_MS) {
        addToast({
          type: 'warning',
          message: 'Mantén pulsado y habla al menos un segundo.',
        })
        try {
          await stopRecording()
        } catch {
          // ignorar — solo queremos cortar el stream del mic
        }
        recordingStartRef.current = null
        setState('idle')
        return
      }
      setIsProcessing(true)
      try {
        const blob = await stopRecording()
        const formData = new FormData()
        formData.append('audio', blob, 'recording.webm')
        formData.append('session_id', id)
        setState('thinking')
        let text: string | undefined
        try {
          const res = await apiClient.post('/asr/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          text = (res.data?.text as string | undefined)?.trim()
        } catch (err) {
          // Error visible: muestra el mensaje real del backend para
          // saber si es problema de Whisper, ffmpeg, auth, etc.
          const axiosErr = err as { response?: { data?: { detail?: string } } }
          const detail =
            axiosErr.response?.data?.detail ||
            (err as Error).message ||
            'desconocido'
          console.error('[Voice] ASR error:', err)
          addToast({
            type: 'error',
            message: `ASR fallo: ${detail}`,
          })
          setState('idle')
          return
        }
        if (!text) {
          addToast({
            type: 'warning',
            message: 'No detectamos lo que dijiste. Intenta de nuevo.',
          })
          setState('idle')
          return
        }
        setLastUserText(text)
        try {
          await sendMessage(id, text, { voiceMode: true })
        } catch (err) {
          console.error('[Voice] sendMessage error:', err)
          addToast({
            type: 'error',
            message: `No pude enviar el mensaje: ${(err as Error).message}`,
          })
          setState('idle')
        }
      } catch (err) {
        console.error('[Voice] unexpected error:', err)
        setState('error')
        addToast({
          type: 'error',
          message: `Error inesperado: ${(err as Error).message}`,
        })
        setTimeout(() => setState('idle'), 1500)
      } finally {
        setIsProcessing(false)
      }
    } else {
      setState('listening')
      recordingStartRef.current = Date.now()
      await startRecording()
    }
  }, [id, isRecording, stopRecording, startRecording, sendMessage, addToast])

  const handleExit = useCallback(() => {
    stopTts()
    navigate(`/session/${id}/chat`)
  }, [id, navigate, stopTts])

  // ── Derived ──────────────────────────────────────────────────────

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const stateLabel: Record<AvatarState, string> = {
    idle: isProcessing ? 'Procesando…' : 'Toca el micrófono para hablar',
    listening: 'Escuchando…',
    thinking: 'Mabel está pensando',
    speaking: 'Mabel está hablando',
    error: 'Hubo un problema',
  }

  const stateColor: Record<AvatarState, string> = {
    idle: 'var(--ink-500)',
    listening: 'var(--success-600)',
    thinking: 'var(--warn-600)',
    speaking: 'var(--mabel-600)',
    error: 'var(--danger-600)',
  }

  const liveBubbles = useMemo(() => {
    const items: { role: string; text: string; id: string }[] = []
    const recent = messages.slice(-2)
    recent.forEach((m) => items.push({ role: m.role, text: m.content, id: m.id }))
    if (isStreaming && streamingText) {
      items.push({ role: 'assistant', text: streamingText, id: 'streaming' })
    }
    if (
      state === 'thinking' &&
      lastUserText &&
      !items.some((i) => i.role === 'user' && i.text === lastUserText)
    ) {
      items.push({ role: 'user', text: lastUserText, id: 'user-temp' })
    }
    return items.slice(-2)
  }, [messages, isStreaming, streamingText, state, lastUserText])

  // Loader solo MIENTRAS preferences carga. Si ya cargo y vino null
  // (404 = student sin preferences row), seguimos al render con los
  // defaults (voice_enabled/voice_mode_enabled =true por accForGate),
  // sino el usuario queda con spinner infinito.
  if (!preferences && prefsLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ink-50)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid var(--ink-200)',
            borderTopColor: 'var(--mabel-600)',
            borderRadius: '50%',
            animation: 'rotate 0.8s linear infinite',
          }}
          aria-label="Cargando"
        />
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at 50% 35%, #FFF5F4 0%, var(--ink-50) 55%, #F2EAE7 100%)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Backdrop sutil */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 20% 80%, rgba(165,25,22,0.06) 0%, transparent 40%), radial-gradient(circle at 80% 20%, rgba(165,25,22,0.04) 0%, transparent 40%)',
          pointerEvents: 'none',
        }}
      />

      {/* ───────── HEADER (replica el patron del chat) ─────────
          Mismo padding, border-bottom, backdrop-filter y la clase
          mobile-fab-safe-left para no quedar bajo el hamburger del
          sidebar en mobile. Estructura:
            Izquierda: [Volver] + Titulo + chip "Voz"
            Derecha:   Timer */}
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
          position: 'relative',
          zIndex: 4,
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          <button
            onClick={handleExit}
            title="Volver al chat de texto"
            aria-label="Volver al chat de texto"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px 6px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid var(--ink-200)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-700)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--mabel-700)'
              e.currentTarget.style.borderColor = 'var(--mabel-200)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-700)'
              e.currentTarget.style.borderColor = 'var(--ink-200)'
            }}
          >
            <ArrowLeft size={13} strokeWidth={2.25} />
            <span className="hidden-mobile">Volver</span>
          </button>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--ink-900)',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 320,
              minWidth: 0,
            }}
            title={currentSession?.topic_hint || 'Conversación por voz'}
          >
            {currentSession?.topic_hint || 'Conversación por voz'}
          </div>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--mabel-700)',
              background: 'var(--mabel-50)',
              padding: '2px 8px',
              borderRadius: 999,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <Mic size={10} strokeWidth={2.5} />
            Voz
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-600)',
            padding: '5px 11px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid var(--ink-200)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {fmtTime(elapsed)}
        </span>
      </div>

      {/* ───────── ZONA AVATAR (flex: 1, centra avatar + estado) ─────────
          flex:1 hace que se expanda y llene todo el espacio entre header
          y transcript. Sin paddingBottom hack: el transcript ya es su
          PROPIO elemento flex con su propio espacio reservado. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          minHeight: 0,
          gap: 18,
          padding: '12px 24px',
        }}
      >
        {/* Avatar + marco oscuro + rings reactivos */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ReactiveRings state={state} />
          <div
            className="voice-avatar-frame"
            style={{
              borderRadius: 32,
              background:
                'linear-gradient(165deg, #1f1c1b 0%, #2a2624 50%, #1a1716 100%)',
              boxShadow:
                'var(--shadow-lg), inset 0 -10px 28px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.04) 0%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
            <div className="voice-avatar-figure">
              <MabelAvatar state={state} />
            </div>
          </div>
        </div>

        {/* Nombre + chip de estado */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--ink-900)',
              letterSpacing: '-0.01em',
            }}
          >
            Mabel
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 13px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid var(--ink-200)',
              fontSize: 12,
              fontWeight: 600,
              color: stateColor[state],
              boxShadow: 'var(--shadow-sm)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: stateColor[state],
                animation:
                  state === 'idle' || state === 'error'
                    ? 'none'
                    : 'blink 1.2s ease-in-out infinite',
              }}
            />
            <span>{stateLabel[state]}</span>
          </div>
        </div>
      </div>

      {/* ───────── ZONA TRANSCRIPT (altura fija reservada) ─────────
          flex-shrink: 0 + minHeight garantiza que SIEMPRE tenga este
          espacio aunque no haya burbujas. Las burbujas se anclan al
          BOTTOM via justifyContent: flex-end, de modo que la mas
          reciente queda pegada arriba de los controles. */}
      <div
        style={{
          flexShrink: 0,
          minHeight: 140,
          maxHeight: 200,
          padding: '8px 24px 12px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {liveBubbles.map((m, i, arr) => (
            <VoiceBubble
              key={m.id}
              role={m.role}
              text={m.text}
              fading={i === 0 && arr.length > 1}
            />
          ))}
        </div>
      </div>

      {/* ───────── ZONA CONTROLES (flex-shrink: 0) ───────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          padding: '0 24px 20px',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '12px 22px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid var(--ink-200)',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <ControlButton
            icon={isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            label={isMuted ? 'Activar voz' : 'Silenciar voz'}
            onClick={toggleMute}
            active={isMuted}
          />

          <ControlButton
            icon={isRecording ? <MicOff size={22} /> : <Mic size={22} />}
            label={
              isRecording
                ? 'Enviar'
                : isProcessing
                  ? 'Procesando…'
                  : 'Hablar'
            }
            primary
            size="lg"
            recording={isRecording}
            disabled={isProcessing || state === 'thinking' || state === 'speaking'}
            onClick={handleMicToggle}
          />

          <div
            style={{
              width: 1,
              alignSelf: 'stretch',
              background: 'var(--ink-200)',
              margin: '4px 0',
            }}
          />

          <ControlButton
            icon={<X size={18} />}
            label="Terminar"
            danger
            onClick={handleExit}
          />
        </div>
      </div>

      {micError && (
        <div
          style={{
            position: 'absolute',
            top: 76,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: 'var(--danger-50)',
            color: 'var(--danger-700)',
            border: '1px solid var(--danger-200)',
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <AlertCircle size={14} />
          {micError}
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────

interface VoiceBubbleProps {
  role: string
  text: string
  fading?: boolean
}

function VoiceBubble({ role, text, fading }: VoiceBubbleProps) {
  const isUser = role === 'user'
  return (
    <div
      style={{
        width: '100%',
        opacity: fading ? 0.55 : 1,
        transition: 'opacity var(--dur-slow) var(--ease-out)',
        textAlign: isUser ? 'right' : 'left',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          maxWidth: '85%',
          padding: '9px 14px',
          background: isUser ? 'var(--mabel-600)' : '#fff',
          color: isUser ? '#fff' : 'var(--ink-900)',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: 13,
          lineHeight: 1.45,
          fontWeight: 500,
          border: isUser ? 'none' : '1px solid var(--ink-200)',
          boxShadow: 'var(--shadow-md)',
          textAlign: 'left',
        }}
      >
        {text}
      </div>
    </div>
  )
}

interface ControlButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  danger?: boolean
  primary?: boolean
  size?: 'md' | 'lg'
  recording?: boolean
  disabled?: boolean
}

function ControlButton({
  icon,
  label,
  onClick,
  active,
  danger,
  primary,
  size = 'md',
  recording,
  disabled,
}: ControlButtonProps) {
  const dims = size === 'lg' ? { w: 60, h: 60 } : { w: 44, h: 44 }
  const bg = primary
    ? recording
      ? 'var(--danger-600)'
      : 'var(--mabel-600)'
    : danger
      ? '#fff'
      : active
        ? 'var(--ink-800)'
        : 'rgba(255,255,255,0.9)'
  const color = primary
    ? '#fff'
    : danger
      ? 'var(--danger-600)'
      : active
        ? '#fff'
        : 'var(--ink-800)'
  const border = danger
    ? '1px solid var(--danger-200)'
    : primary
      ? 'none'
      : '1px solid var(--ink-200)'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        title={label}
        aria-label={label}
        style={{
          width: dims.w,
          height: dims.h,
          borderRadius: 999,
          background: bg,
          color,
          border,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: primary ? 'var(--shadow-brand)' : 'var(--shadow-sm)',
          transition: 'all var(--dur-fast) var(--ease-out)',
          animation:
            recording && primary
              ? 'halo-breathe 1.4s ease-in-out infinite'
              : 'none',
        }}
      >
        {icon}
      </button>
      <span
        style={{
          fontSize: 11,
          color: 'var(--ink-600)',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
    </div>
  )
}
