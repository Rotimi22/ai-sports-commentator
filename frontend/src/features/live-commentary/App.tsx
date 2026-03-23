import { useEffect, useRef } from 'react'

import { ConnectionErrorView } from './features/live-commentary/components/ConnectionErrorView'
import { LiveCommentaryView } from './features/live-commentary/components/LiveCommentaryView'
import { MatchSelectionView } from './features/live-commentary/components/MatchSelectionView'
import { useLiveCommentary } from './features/live-commentary/useLiveCommentary'
import { useVoiceChat } from './features/live-commentary/useVoiceChat'

function App() {
  const {
    view,
    fixtures,
    fixturesLoading,
    snapshot,
    connectionLabel,
    goalFlash,
    isAudioPlaying,
    commentaryHistory,
    retryFixtures,
    startMatch,
    stopMatch,
    enqueueVoiceAudio,
    setView,
  } = useLiveCommentary()

  // Build match context string for the ElevenLabs agent prompt
  const matchContext = snapshot
    ? `${snapshot.homeTeam} vs ${snapshot.awayTeam}, current score ${snapshot.score}, ${snapshot.minute}' minutes played in the ${snapshot.league || 'league'}.`
    : null

  const voice = useVoiceChat({
    onAudio: enqueueVoiceAudio,
    matchContext,
  })

  // Track whether we've already auto-started voice for this match
  const autoStartedRef = useRef(false)

  // Auto-start voice commentary as soon as the view switches to 'live'
  useEffect(() => {
    if (view === 'live' && snapshot && voice.status === 'idle' && !autoStartedRef.current) {
      autoStartedRef.current = true
      voice.start()
    }
    // Reset the flag when going back to selection
    if (view === 'selection') {
      autoStartedRef.current = false
    }
  }, [view, snapshot, voice.status, voice.start])

  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  useEffect(() => {
    if (voice.status === 'error') {
      window.setTimeout(() => voice.stop(), 1200)
    }
  }, [voice.status, voice.stop])

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="bg-pattern pointer-events-none absolute inset-0" />
      {view === 'selection' && (
        <MatchSelectionView
          fixtures={fixtures}
          loading={fixturesLoading}
          onRefresh={() => {
            retryFixtures()
            setView('selection')
          }}
          onSelect={startMatch}
        />
      )}

      {view === 'live' && snapshot && (
        <LiveCommentaryView
          snapshot={snapshot}
          goalFlash={goalFlash}
          connectionLabel={connectionLabel}
          isAudioPlaying={isAudioPlaying}
          commentaryHistory={commentaryHistory}
          voiceStatus={voice.status}
          onVoiceStart={voice.start}
          onVoiceStop={voice.stop}
          onEnd={async () => {
            voice.stop()
            await stopMatch()
          }}
        />
      )}

      {view === 'connection-error' && (
        <ConnectionErrorView
          onRetry={() => {
            retryFixtures()
            setView('selection')
          }}
        />
      )}
    </div>
  )
}

export default App
