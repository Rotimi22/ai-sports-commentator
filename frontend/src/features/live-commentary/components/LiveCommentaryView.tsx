import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRightLeft,
  ChevronDown,
  CircleDot,
  Mic,
  Radio,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Tv2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { MatchEvent, MatchSnapshot, VoiceStatus } from '../types'

function EventIcon({ type }: { type: string }) {
  if (/goal/i.test(type)) return <CircleDot className="size-5 text-[hsl(var(--accent-2))]" />
  if (/yellow/i.test(type)) return <RectangleHorizontal className="size-5 text-[hsl(var(--accent-2))]" />
  if (/red/i.test(type)) return <RectangleVertical className="size-5 text-destructive" />
  if (/sub/i.test(type)) return <ArrowRightLeft className="size-5 text-primary" />
  return <Tv2 className="size-5 text-muted-foreground" />
}

function TypewriterText({ text }: { text: string }) {
  const [visible, setVisible] = useState('')

  useEffect(() => {
    setVisible('')
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setVisible(text.slice(0, i))
      if (i >= text.length) window.clearInterval(timer)
    }, 30)
    return () => window.clearInterval(timer)
  }, [text])

  return <p className="text-lg leading-8 text-foreground/95">{visible}</p>
}

function VoiceOrb({ status, onClick, onStop }: { status: VoiceStatus; onClick: () => void; onStop: () => void }) {
  const active = status === 'listening' || status === 'speaking'

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.button
        onClick={active ? onStop : onClick}
        animate={active ? { scale: [1, 1.12, 1] } : { scale: [1, 1.05, 1] }}
        transition={{ duration: active ? 0.8 : 3, repeat: Infinity, ease: 'easeInOut' }}
        className="voice-orb relative flex size-20 items-center justify-center rounded-full md:size-24"
      >
        <AnimatePresence>
          {status === 'connecting' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-[-8px] rounded-full border border-dashed border-primary/60"
            />
          )}
          {status === 'speaking' && (
            <motion.div
              initial={{ scale: 1, opacity: 0.8 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border border-primary/40"
            />
          )}
        </AnimatePresence>
        <Mic className="size-8 text-primary-foreground" />
      </motion.button>
      <p className="text-sm text-muted-foreground">
        {status === 'idle' && 'Click to talk to your commentator'}
        {status === 'connecting' && 'Connecting to your commentator...'}
        {status === 'listening' && 'Listening...'}
        {status === 'speaking' && 'Commentator is speaking...'}
        {status === 'error' && 'Voice connection failed. Try again.'}
      </p>
      <Button variant="destructive" onClick={onStop}>
        <Square className="size-4" /> Stop Commentary
      </Button>
    </div>
  )
}

export function LiveCommentaryView({
  snapshot,
  goalFlash,
  connectionLabel,
  isAudioPlaying,
  commentaryHistory,
  voiceStatus,
  onVoiceStart,
  onVoiceStop,
  onEnd,
}: {
  snapshot: MatchSnapshot
  goalFlash: boolean
  connectionLabel: string
  isAudioPlaying: boolean
  commentaryHistory: MatchEvent[]
  voiceStatus: VoiceStatus
  onVoiceStart: () => void
  onVoiceStop: () => void
  onEnd: () => void
}) {
  const commentaryText =
    snapshot.commentaryText ||
    `${snapshot.homeTeam} ${snapshot.score} ${snapshot.awayTeam}. ${snapshot.minute}' on the clock and the match is crackling with tension.`
  const bars = useMemo(() => Array.from({ length: 16 }, (_, i) => i), [])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <motion.section
        animate={
          goalFlash
            ? {
                boxShadow: [
                  '0 0 0 rgba(255,193,7,0)',
                  '0 0 80px rgba(255,193,7,0.35)',
                  '0 0 0 rgba(255,193,7,0)',
                ],
              }
            : {}
        }
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-card/80 p-6 shadow-[var(--shadow-panel)] backdrop-blur-xl"
      >
        <div className="scoreboard-glow absolute inset-0" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="team-crest">{snapshot.homeTeam.slice(0, 2).toUpperCase()}</div>
            <div>
              <p className="font-display text-4xl tracking-wide">{snapshot.homeTeam}</p>
              <p className="text-sm text-muted-foreground">
                {snapshot.league} · {snapshot.country}
              </p>
            </div>
          </div>

          <div className="text-center">
            <div className="scoreboard-score font-display text-7xl leading-none md:text-8xl" style={{ color: 'hsl(var(--accent-2))' }}>
              {snapshot.score}
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="live-badge">LIVE {snapshot.minute}'</span>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-foreground">
                {connectionLabel}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:flex-row-reverse">
            <div className="team-crest">{snapshot.awayTeam.slice(0, 2).toUpperCase()}</div>
            <div className="text-right">
              <p className="font-display text-4xl tracking-wide">{snapshot.awayTeam}</p>
              <p className="text-sm text-muted-foreground">Luxury match studio</p>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-card min-h-[28rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
              <Radio className="size-5 text-primary" /> Event Feed
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {snapshot.events.map((event, index) => (
                <motion.div
                  key={`${event.type}-${event.minute}-${event.player}-${index}`}
                  initial={{ opacity: 0, y: -14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex min-w-12 justify-center rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                      {event.minute}'
                    </span>
                    <EventIcon type={event.type} />
                    <div>
                      <p className="font-semibold text-foreground">
                        {event.player || event.type}{' '}
                        <span className="text-sm font-normal text-muted-foreground">{event.team}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{event.detail || event.type}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
                <Tv2 className="size-5" style={{ color: 'hsl(var(--accent-2))' }} /> AI Commentary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <TypewriterText text={commentaryText} />
              <div className="flex h-16 items-end gap-1">
                {bars.map((bar) => (
                  <motion.span
                    key={bar}
                    animate={isAudioPlaying ? { height: [14, 42, 18, 30] } : { height: 10 }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: bar * 0.04 }}
                    className="w-full rounded-full bg-gradient-to-t from-primary/50 to-[hsl(var(--accent-2))]"
                  />
                ))}
              </div>
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-foreground">
                  Past commentary <ChevronDown className="size-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-2">
                  {commentaryHistory.map((event, index) => (
                    <div
                      key={`${event.minute}-${index}`}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-muted-foreground"
                    >
                      {event.minute}' · {event.player || event.type} · {event.detail || event.team}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="flex flex-col items-center gap-4 p-6">
              <VoiceOrb status={voiceStatus} onClick={onVoiceStart} onStop={onVoiceStop} />
              <Button variant="outline" size="lg" className="bg-transparent" onClick={onEnd}>
                Back to live matches
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
