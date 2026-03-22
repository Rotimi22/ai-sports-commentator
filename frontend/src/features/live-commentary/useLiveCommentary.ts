import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import { API_BASE, fetchCurrentFixture, fetchLiveFixtures, startFixture, stopFixture } from './api'
import { useAudioQueue } from './useAudioQueue'
import type { AppView, Fixture, MatchSnapshot, MatchSocketMessage } from './types'

const WS_URL = API_BASE.replace('http', 'ws') + '/ws/match'

export function useLiveCommentary() {
  const [view, setView] = useState<AppView>('selection')
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null)
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null)
  const [connectionLabel, setConnectionLabel] = useState('Offline')
  const [goalFlash, setGoalFlash] = useState(false)
  const activeRef = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<number | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const { enqueue, stopAll, isPlaying } = useAudioQueue()

  const fixturesQuery = useQuery({
    queryKey: ['live-fixtures'],
    queryFn: fetchLiveFixtures,
    refetchInterval: 120000,
    retry: 1,
  })

  const cleanupSocket = useCallback(() => {
    if (pingRef.current) window.clearInterval(pingRef.current)
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const connectSocket = useCallback(() => {
    cleanupSocket()
    const socket = new WebSocket(WS_URL)
    wsRef.current = socket
    setConnectionLabel('Connecting')

    socket.onopen = () => {
      setConnectionLabel('Live')
      toast.success('Connected to commentary server')
      pingRef.current = window.setInterval(() => socket.send('ping'), 20000)
    }

    socket.onmessage = (event) => {
      const message: MatchSocketMessage = JSON.parse(event.data)
      if (message.type === 'commentary_audio') {
        enqueue(message.audio_b64)
        return
      }
      if (message.type !== 'match_update') return
      const update = message.data
      if ((update.new_events || []).some((item) => item.type.toLowerCase().includes('goal'))) {
        setGoalFlash(true)
        window.setTimeout(() => setGoalFlash(false), 2000)
      }
      setSnapshot((current) => ({
        fixtureId: current?.fixtureId ?? selectedFixture?.fixtureId,
        homeTeam: update.home_team ?? current?.homeTeam ?? selectedFixture?.home ?? 'Home',
        awayTeam: update.away_team ?? current?.awayTeam ?? selectedFixture?.away ?? 'Away',
        score: update.score ?? current?.score ?? selectedFixture?.score ?? '0-0',
        minute: Number(update.minute ?? current?.minute ?? selectedFixture?.minute ?? 0),
        league: current?.league ?? selectedFixture?.league,
        country: current?.country ?? selectedFixture?.country,
        commentaryText: update.commentary_text ?? current?.commentaryText,
        events: [...(update.new_events || []), ...(current?.events || [])],
      }))
    }

    socket.onclose = () => {
      setConnectionLabel('Disconnected')
      if (!activeRef.current) return
      toast('Reconnecting to match feed...')
      reconnectRef.current = window.setTimeout(connectSocket, 3000)
    }

    socket.onerror = () => setConnectionLabel('Error')
  }, [cleanupSocket, enqueue, selectedFixture])

  const startMatch = useCallback(async (fixture: Fixture) => {
    try {
      await startFixture(fixture.fixtureId)
      const current = await fetchCurrentFixture()
      setSelectedFixture(fixture)
      setSnapshot(current)
      setView('live')
      activeRef.current = true
      connectSocket()
    } catch {
      setView('connection-error')
      toast.error('Cannot reach the commentary server')
    }
  }, [connectSocket])

  const stopMatch = useCallback(async () => {
    activeRef.current = false
    cleanupSocket()
    stopAll()
    await stopFixture().catch(() => undefined)
    setSnapshot(null)
    setSelectedFixture(null)
    setView('selection')
    setConnectionLabel('Offline')
  }, [cleanupSocket, stopAll])

  useEffect(() => {
    if (fixturesQuery.isError) setView('connection-error')
  }, [fixturesQuery.isError])

  useEffect(() => () => cleanupSocket(), [cleanupSocket])

  const commentaryHistory = useMemo(() => snapshot?.events.slice(0, 8) || [], [snapshot?.events])

  return {
    view,
    fixtures: fixturesQuery.data || [],
    fixturesLoading: fixturesQuery.isLoading,
    snapshot,
    selectedFixture,
    connectionLabel,
    goalFlash,
    isAudioPlaying: isPlaying,
    commentaryHistory,
    retryFixtures: fixturesQuery.refetch,
    startMatch,
    stopMatch,
    setView,
    enqueueVoiceAudio: enqueue,
  }
}
