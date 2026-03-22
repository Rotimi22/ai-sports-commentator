import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchSignedUrl } from './api'
import type { VoiceStatus } from './types'

function floatToInt16(float32: Float32Array) {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return pcm
}

export function useVoiceChat(onAudio: (base64: string) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')

  const stop = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    wsRef.current?.close()
    audioContextRef.current?.close().catch(() => undefined)
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    wsRef.current = null
    audioContextRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('connecting')
    try {
      const signedUrl = await fetchSignedUrl()
      const socket = new WebSocket(signedUrl)
      wsRef.current = socket

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data)
        if (payload.type === 'audio' && payload.audio_event?.audio_base_64) {
          onAudio(payload.audio_event.audio_base_64)
          setStatus('speaking')
          window.setTimeout(() => setStatus((prev) => prev === 'idle' ? prev : 'listening'), 600)
        }
      }

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('Voice websocket failed'))
      })

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = mediaStream
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(mediaStream)
      sourceRef.current = source
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const input = event.inputBuffer.getChannelData(0)
        wsRef.current.send(floatToInt16(input).buffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
      setStatus('listening')
    } catch {
      stop()
      setStatus('error')
    }
  }, [onAudio, status, stop])

  useEffect(() => () => stop(), [stop])

  return { status, start, stop, isActive: status !== 'idle' && status !== 'error' }
}
