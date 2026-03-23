import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchSignedUrl } from './api'
import type { VoiceStatus } from './types'

/**
 * Convert Float32 PCM samples to Int16, then base64-encode for ElevenLabs.
 */
function pcmToBase64(float32: Float32Array): string {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export interface VoiceChatOptions {
  /** Called when agent sends audio back */
  onAudio: (base64: string) => void
  /** Match context injected into the agent's first message */
  matchContext?: string | null
}

export function useVoiceChat({ onAudio, matchContext }: VoiceChatOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const conversationIdRef = useRef<string | null>(null)

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
    conversationIdRef.current = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    if (status !== 'idle') return
    setStatus('connecting')

    try {
      // 1. Get signed URL from our backend
      const signedUrl = await fetchSignedUrl()
      const socket = new WebSocket(signedUrl)
      wsRef.current = socket

      // 2. Handle all incoming messages from ElevenLabs
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case 'conversation_initiation_metadata': {
            // Server ready — send our handshake with config override
            // This tells the agent to immediately speak its first message
            // with full match context, no user prompt needed.
            conversationIdRef.current = msg.conversation_initiation_metadata_event?.conversation_id || null

            const initPayload: Record<string, unknown> = {
              type: 'conversation_initiation_client_data',
              conversation_config_override: {
                agent: {
                  prompt: {
                    prompt: matchContext
                      ? `You are a world-class live sports commentator — think Gary Neville meets Peter Drury. Your style is passionate, knowledgeable, and electric. You use vivid language, historical context, and player backstory to bring every moment to life. Keep responses conversational but pundit-sharp. Max 3-4 sentences per commentary burst unless the viewer asks for more depth.\n\nCURRENT MATCH CONTEXT:\n${matchContext}`
                      : undefined,
                  },
                  first_message: matchContext
                    ? `Welcome to the match! ${matchContext} I'm your live AI commentator — let's dive into the action! Feel free to interrupt me anytime with questions about the players, tactics, or anything happening on the pitch.`
                    : "Welcome! I'm your live AI sports commentator. Pick a match and I'll bring every moment to life! Feel free to ask me anything.",
                },
              },
            }

            socket.send(JSON.stringify(initPayload))
            setStatus('listening')
            break
          }

          case 'audio': {
            // Agent is speaking — relay audio to our playback queue
            const b64 = msg.audio_event?.audio_base_64
            if (b64) {
              onAudio(b64)
              setStatus('speaking')
            }
            break
          }

          case 'agent_response':
            // Agent finished a response turn
            setStatus('listening')
            break

          case 'user_transcript':
            // User speech detected
            setStatus('listening')
            break

          case 'interruption':
            // User interrupted the agent
            setStatus('listening')
            break

          case 'ping': {
            // Keep-alive — respond with pong
            const pingId = msg.ping_event?.event_id
            socket.send(JSON.stringify({
              type: 'pong',
              event_id: pingId,
            }))
            break
          }

          default:
            break
        }
      }

      // 3. Wait for socket to open
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve()
        socket.onerror = () => reject(new Error('Voice websocket failed'))
      })

      // 4. Get microphone access for user interruptions/questions
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = mediaStream
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(mediaStream)
      sourceRef.current = source
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      // 5. Stream user audio as base64 JSON (NOT raw binary)
      processor.onaudioprocess = (audioEvent) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const input = audioEvent.inputBuffer.getChannelData(0)
        wsRef.current.send(JSON.stringify({
          user_audio_chunk: pcmToBase64(input),
        }))
      }

      source.connect(processor)
      processor.connect(audioContext.destination)
    } catch {
      stop()
      setStatus('error')
    }
  }, [matchContext, onAudio, status, stop])

  useEffect(() => () => stop(), [stop])

  return {
    status,
    start,
    stop,
    isActive: status !== 'idle' && status !== 'error',
    conversationId: conversationIdRef.current,
  }
}
