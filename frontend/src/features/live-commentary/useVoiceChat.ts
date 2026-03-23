import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchSignedUrl } from './api'
import type { VoiceStatus } from './types'

/**
 * Convert Float32 PCM samples to Int16, then return as a base64 string
 * ElevenLabs Conversational AI expects base64-encoded PCM16 audio inside JSON.
 */
function pcmToBase64(float32: Float32Array): string {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function useVoiceChat(onAudio: (base64: string) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')

  const stop = useCallback(() => {
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Gracefully close the ElevenLabs conversation
      wsRef.current.close()
    }
    audioContextRef.current?.close().catch(() => undefined)
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    wsRef.current = null
    audioContextRef.current = null
    conversationIdRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('connecting')
    try {
      const signedUrl = await fetchSignedUrl()
      const socket = new WebSocket(signedUrl)
      wsRef.current = socket

      // Wait for the socket to open AND receive the initiation metadata
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('ElevenLabs handshake timeout'))
        }, 10000)

        socket.onerror = () => {
          window.clearTimeout(timeout)
          reject(new Error('Voice websocket failed'))
        }

        socket.onopen = () => {
          // Socket is open — now wait for the server's initiation message
        }

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data)

            // Step 1: Server sends conversation_initiation_metadata
            // We must reply with conversation_initiation_client_data
            if (payload.type === 'conversation_initiation_metadata') {
              conversationIdRef.current = payload.conversation_initiation_metadata_event?.conversation_id ?? null

              // Send the required client handshake response
              socket.send(JSON.stringify({
                type: 'conversation_initiation_client_data',
                conversation_initiation_client_data: {
                  conversation_config_override: {
                    agent: {
                      prompt: {},
                      first_message: '',
                      language: 'en',
                    },
                    tts: {
                      voice_id: 'onwK4e9ZLuTAKqWW03F9',
                    },
                  },
                },
              }))

              window.clearTimeout(timeout)
              resolve()
              return
            }

            // Step 2: Handle incoming audio from ElevenLabs agent
            if (payload.type === 'audio' && payload.audio_event?.audio_base_64) {
              onAudio(payload.audio_event.audio_base_64)
              setStatus('speaking')
              window.setTimeout(() => setStatus((prev) => (prev === 'idle' ? prev : 'listening')), 600)
              return
            }

            // Handle agent responses (text)
            if (payload.type === 'agent_response') {
              // Optional: surface agent text responses if needed
              return
            }

            // Handle interruption events
            if (payload.type === 'interruption') {
              setStatus('listening')
              return
            }

            // Handle ping from server
            if (payload.type === 'ping') {
              socket.send(JSON.stringify({
                type: 'pong',
                event_id: payload.ping_event?.event_id,
              }))
              return
            }

          } catch {
            // Non-JSON message, ignore
          }
        }
      })

      // Step 3: Capture microphone and stream audio as base64 JSON
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

        // KEY FIX: Send audio as base64-encoded JSON, NOT raw binary
        const base64Audio = pcmToBase64(input)
        wsRef.current.send(JSON.stringify({
          user_audio_chunk: base64Audio,
        }))
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
