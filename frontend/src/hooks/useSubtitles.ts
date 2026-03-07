import { useCallback, useRef, useState } from 'react'

export default function useSubtitles() {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startSubtitles = useCallback((text: string, durationMs: number) => {
    stopSubtitles()
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0 || durationMs <= 0) return

    // Calculate total "weight" based on character count
    const totalChars = words.reduce((sum, w) => sum + w.length, 0)
    let elapsed = 0
    let wordIdx = 0

    // Build timing array: time at which each word starts
    const timings: number[] = []
    for (const word of words) {
      timings.push(elapsed)
      elapsed += (word.length / totalChars) * durationMs
    }

    setCurrentWordIndex(0)
    const startTime = Date.now()

    intervalRef.current = setInterval(() => {
      const now = Date.now() - startTime
      while (wordIdx < words.length - 1 && now >= timings[wordIdx + 1]) {
        wordIdx++
      }
      setCurrentWordIndex(wordIdx)
      if (wordIdx >= words.length - 1) {
        // Keep last word highlighted briefly, then clear
        setTimeout(() => {
          setCurrentWordIndex(-1)
        }, 500)
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, 50)
  }, [])

  const stopSubtitles = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setCurrentWordIndex(-1)
  }, [])

  return { currentWordIndex, startSubtitles, stopSubtitles }
}
