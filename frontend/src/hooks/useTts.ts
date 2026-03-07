import { useCallback, useRef, useState } from 'react'
import apiClient from '../api/client'

const MUTE_KEY = 'mabel_tts_muted'

export default function useTts() {
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      localStorage.setItem(MUTE_KEY, String(next))
      if (next && audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      return next
    })
  }, [])

  const playTts = useCallback(
    async (text: string, voice?: string): Promise<number> => {
      if (isMuted) return 0

      try {
        const params: Record<string, string> = { text }
        if (voice) params.voice = voice

        const response = await apiClient.get('/tts/synthesize', {
          params,
          responseType: 'blob',
        })

        const blob = response.data as Blob
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        return new Promise<number>((resolve) => {
          audio.onloadedmetadata = () => {
            const durationMs = Math.round(audio.duration * 1000)
            audio.play()
            audio.onended = () => {
              URL.revokeObjectURL(url)
              audioRef.current = null
              resolve(durationMs)
            }
          }
          audio.onerror = () => {
            URL.revokeObjectURL(url)
            audioRef.current = null
            resolve(0)
          }
        })
      } catch {
        return 0
      }
    },
    [isMuted]
  )

  const stopTts = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  return { playTts, stopTts, isMuted, toggleMute, audioRef }
}
