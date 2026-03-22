import { useCallback, useEffect, useRef, useState } from 'react'

function base64ToBlobUrl(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  return URL.createObjectURL(blob)
}

export function useAudioQueue() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<string[]>([])
  const currentUrlRef = useRef<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const playNext = useCallback(() => {
    if (!audioRef.current || queueRef.current.length === 0) {
      setIsPlaying(false)
      return
    }
    const next = queueRef.current.shift()!
    currentUrlRef.current = base64ToBlobUrl(next)
    audioRef.current.src = currentUrlRef.current
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
  }, [])

  const enqueue = useCallback((base64: string) => {
    if (!base64) return
    queueRef.current.push(base64)
    if (!isPlaying) playNext()
  }, [isPlaying, playNext])

  const stopAll = useCallback(() => {
    queueRef.current = []
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current)
    currentUrlRef.current = null
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    audio.onended = () => {
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
      playNext()
    }
    return () => {
      stopAll()
      audioRef.current = null
    }
  }, [playNext, stopAll])

  return { enqueue, stopAll, isPlaying }
}
