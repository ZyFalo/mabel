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
  // Última solicitud de TTS — guardamos texto + voice para poder
  // re-disparar la reproducción cuando el usuario desmutea mientras
  // Mabel estaba hablando (bug 2026-05-27). Se sobreescribe cada
  // vez que llega un nuevo mensaje a reproducir, así que el replay
  // siempre apunta al último mensaje del assistant, no a uno viejo.
  const lastSpeechRef = useRef<{ text: string; voice?: string } | null>(null)

  // Forward declaration por hoisting: toggleMute usa playTtsInternal,
  // que se define más abajo y a su vez puede ser invocada por el
  // efecto del unmute. useRef rompe la dependencia circular sin
  // cambiar la API pública del hook.
  const playTtsRef = useRef<
    ((text: string, voice?: string) => Promise<number>) | null
  >(null)

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      localStorage.setItem(MUTE_KEY, String(next))
      if (next) {
        // Mute → cancelar reproducción en vuelo. El texto queda en
        // lastSpeechRef para poder replay al desmutear.
        cancelledRef.current = true
        if (abortRef.current) abortRef.current.abort()
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current = null
        }
      } else {
        // Desmute → si hay un mensaje guardado, replay desde el
        // inicio. La UX esperada (reportada 2026-05-27): "cuando
        // muteo y desmuteo mientras Mabel habla, debería volver a
        // escucharla nuevamente". Reset desde el inicio porque
        // pausar/reanudar exacto requeriría persistir el blob
        // del audio actual y su currentTime, mientras que con
        // sentence-streaming el blob cambia cada frase y la
        // posición se vuelve ambigua.
        const last = lastSpeechRef.current
        if (last && playTtsRef.current) {
          // Async fire-and-forget — el setState ya devolvió `next`.
          void playTtsRef.current(last.text, last.voice)
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
            // Loguear errores específicos de play() — iOS Safari PWA
            // bloquea autoplay sin user gesture activo y rechaza
            // con NotAllowedError. Bug PWA 2026-05-27: antes el
            // catch swallowea silenciosamente y el usuario veía que
            // no sonaba sin pista del por qué. Ahora el error sale
            // a la consola con nombre + mensaje para diagnóstico.
            audio.play().catch((playErr: Error) => {
              console.error(
                '[useTts] audio.play() failed:',
                playErr?.name || 'Unknown',
                '-',
                playErr?.message || playErr,
              )
              URL.revokeObjectURL(url)
              if (audioRef.current === audio) audioRef.current = null
              resolve(0)
            })
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
      // Guardar la solicitud ANTES del check de mute. Si el usuario
      // mutea y luego desmutea, queremos que el replay encuentre
      // el texto aquí (mismo último mensaje que NO se reprodujo).
      lastSpeechRef.current = { text, voice }
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

  // Conectar el ref con la callback estable. El ref es la única
  // forma de invocar playTts desde toggleMute sin crear una
  // dependencia circular en el useCallback de toggleMute.
  playTtsRef.current = playTts

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
