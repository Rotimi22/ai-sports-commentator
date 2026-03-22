export type AppView = 'selection' | 'live' | 'connection-error'

export interface Fixture {
  fixtureId: number
  home: string
  away: string
  score: string
  minute: number
  league: string
  country: string
}

export interface MatchEvent {
  type: string
  minute: number
  player?: string
  team?: string
  detail?: string
}

export interface MatchSnapshot {
  fixtureId?: number
  homeTeam: string
  awayTeam: string
  score: string
  minute: number
  league?: string
  country?: string
  events: MatchEvent[]
  commentaryText?: string
}

export interface FixturesResponse {
  fixtures: Array<{
    fixture_id: number
    home: string
    away: string
    score: string
    minute: number
    league: string
    country: string
  }>
}

export interface StartResponse {
  status: string
  fixture_id: number
  agent_id?: string
}

export interface MatchUpdateMessage {
  type: 'match_update'
  data: {
    score?: string
    minute?: number
    home_team?: string
    away_team?: string
    commentary_text?: string
    new_events?: MatchEvent[]
  }
}

export interface CommentaryAudioMessage {
  type: 'commentary_audio'
  audio_b64: string
}

export interface PongMessage {
  type: 'pong'
}

export type MatchSocketMessage = MatchUpdateMessage | CommentaryAudioMessage | PongMessage

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error'
