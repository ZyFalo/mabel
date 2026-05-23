/**
 * useTts — Reproduccion de TTS via backend Piper.
 *
 * Para textos largos usa sentence-streaming: parte el texto en frases
 * (.?!), pide TTS de cada una por separado y las reproduce en cadena.
 * Asi el time-to-first-audio se mantiene en ~2s incluso para
 * respuestas de 30+ segundos de audio total.
 *
 * stopTts() corta inmediatamente: cancela cualquier sintesis en vuelo
 * (AbortController) y vacia la cola de frases pendientes.
 *
 * Return value semantics: `playTts` retorna el AUDIO total real (suma
 * de audio.duration de cada sentencia), NO wall-clock — useSubtitles
 * usa este numero para distribuir los highlights por palabra y
 * necesita la duracion del audio, no la latencia de red.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../api/client'

const MUTE_KEY = 'mabel_tts_muted'

// Abreviaturas comunes en español que NO deben partirse como fin de
// frase. Listadas en minusculas; comparamos lowercased. El splitter
// las protege reemplazando el punto por `\x00` temporalmente.
const SPANISH_ABBREVIATIONS = [
  'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'mtro', 'mtra',
  'p.m', 'a.m', 'd.c', 'a.c', 'etc', 'ej', 'aprox', 'vs',
  'nro', 'no', 'pag', 'págs', 'cap', 'fig', 'tel', 'avd', 'av',
]
const ABBR_RE = new RegExp(
  `\\b(${SPANISH_ABBREVIATIONS.join('|')})\\.`,
  'gi',
)

/** Limpia el texto para que Piper no lea markdown ni emojis literal. */
function sanitizeForTts(text: string): string {
  return (
    text
      // Markdown bold/italic/code/links
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+[.)]\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Emojis: rango ampliado para cubrir tambien skin-tone modifiers,
      // regional indicator flags, variation selectors, zero-width joiner.
      // Sin estos, strippar el emoji base dejaba ZWJ/VS sueltos que
      // Piper leia como ruido o ignoraba con warning.
      .replace(
        /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu,
        '',
      )
      // Saltos de linea → punto+espacio (TTS hace mejor pausa con punto)
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      // Espacios repetidos
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Divide texto en frases para sentence-streaming. Protege abreviaturas
 *  reemplazando temporalmente sus puntos por `\x00` (NUL char, jamas
 *  presente en texto humano) antes de partir, y restaurando despues. */
function splitIntoSentences(text: string): string[] {
  // Paso 1: proteger abreviaturas (Dr. → Dr\x00).
  const protectedText = text.replace(ABBR_RE, (_m, abbr) => `${abbr}\x00`)

  // Paso 2: partir por . ? ! seguido de espacio o fin.
  const out: string[] = []
  let buf = ''
  for (let i = 0; i < protectedText.length; i++) {
    const c = protectedText[i]
    buf += c
    if (/[.!?]/.test(c)) {
      const next = protectedText[i + 1]
      // Fin de frase si lo siguiente es espacio, salto o fin de string.
      if (next === undefined || /\s/.test(next)) {
        out.push(buf.trim())
        buf = ''
      }
    }
  }
  if (buf.trim()) out.push(buf.trim())

  // Paso 3: restaurar el `\x00` → `.` en cada frase.
  return out
    .map((s) => s.replace(/\x00/g, '.'))
    .filter((s) => s.length > 0)
}

export default function useTts() {
  const [isMuted, setIsMuted] = useState(
    () => localStorage.getItem(MUTE_KEY) === 'true',
  )
  // Ya NO se exporta — era footgun: con sentence-streaming el ref ciclaba
  // entre cada <audio> y un consumer externo que llamara .pause() podia
  // pillarlo entre sentencias (null) o pausar la equivocada. El control
  // externo se hace via stopTts() / toggleMute().
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      localStorage.setItem(MUTE_KEY, String(next))
      if (next) {
        cancelledRef.current = true
        if (abortRef.current) abortRef.current.abort()
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current = null
        }
      }
      return next
    })
  }, [])

  /** Sintetiza UNA frase, la reproduce y devuelve su duracion REAL de
   *  audio en ms (audio.duration). Devuelve 0 si fallo o se cancelo. */
  const playOneSentence = useCallback(
    async (sentence: string, voice?: string): Promise<number> => {
      if (cancelledRef.current) return 0
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params: Record<string, string> = { text: sentence }
        if (voice) params.voice = voice
        const response = await apiClient.get('/tts/synthesize', {
          params,
          responseType: 'blob',
          signal: controller.signal,
        })
        if (cancelledRef.current) return 0
        const blob = response.data as Blob
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        return await new Promise<number>((resolve) => {
          audio.onloadedmetadata = () => {
            if (cancelledRef.current) {
              URL.revokeObjectURL(url)
              resolve(0)
              return
            }
            const durationMs = Math.round(audio.duration * 1000)
            audio.play().catch(() => resolve(0))
            audio.onended = () => {
              URL.revokeObjectURL(url)
              if (audioRef.current === audio) audioRef.current = null
              resolve(durationMs)
            }
          }
          audio.onerror = (ev) => {
            console.error('[useTts] audio playback error', ev)
            URL.revokeObjectURL(url)
            if (audioRef.current === audio) audioRef.current = null
            resolve(0)
          }
        })
      } catch (err) {
        const isCancel =
          (err as { name?: string }).name === 'CanceledError' ||
          (err as { name?: string }).name === 'AbortError'
        if (!isCancel) {
          console.error('[useTts] synthesize failed for sentence', err)
        }
        return 0
      }
    },
    [],
  )

  const playTts = useCallback(
    async (text: string, voice?: string): Promise<number> => {
      if (isMuted) return 0
      cancelledRef.current = false
      const cleaned = sanitizeForTts(text)
      if (!cleaned) return 0
      const sentences = splitIntoSentences(cleaned)
      // Sumamos la duracion REAL de audio de cada sentencia (no
      // wall-clock) — useSubtitles necesita la duracion del audio
      // para distribuir highlights por palabra. Wall-clock incluye
      // latencia HTTP de cada sentencia, desync los subtitulos.
      let totalAudioMs = 0
      for (const s of sentences) {
        if (cancelledRef.current) break
        totalAudioMs += await playOneSentence(s, voice)
      }
      return totalAudioMs
    },
    [isMuted, playOneSentence],
  )

  const stopTts = useCallback(() => {
    cancelledRef.current = true
    if (abortRef.current) abortRef.current.abort()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
      if (abortRef.current) abortRef.current.abort()
      if (audioRef.current) audioRef.current.pause()
    }
  }, [])

  // NO exportamos audioRef intencionalmente — control externo solo
  // via stopTts/toggleMute. Si necesitas saber si esta sonando, agrega
  // un boolean state explicito en lugar de leer audioRef.
  return { playTts, stopTts, isMuted, toggleMute }
}
