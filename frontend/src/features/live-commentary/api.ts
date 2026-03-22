import type { Fixture, FixturesResponse, MatchSnapshot, StartResponse } from './types'

const API_BASE = 'http://localhost:8000'

function ensureOk(response: Response) {
  if (!response.ok) throw new Error(`Request failed: ${response.status}`)
  return response
}

function mapFixture(fixture: FixturesResponse['fixtures'][number]): Fixture {
  return {
    fixtureId: fixture.fixture_id,
    home: fixture.home,
    away: fixture.away,
    score: fixture.score,
    minute: fixture.minute,
    league: fixture.league,
    country: fixture.country,
  }
}

export async function fetchLiveFixtures(): Promise<Fixture[]> {
  const response = await fetch(`${API_BASE}/fixtures/live`)
  const data: FixturesResponse = await ensureOk(response).json()
  return (data.fixtures || []).map(mapFixture)
}

export async function startFixture(fixtureId: number): Promise<StartResponse> {
  const response = await fetch(`${API_BASE}/fixtures/${fixtureId}/start`, { method: 'POST' })
  return ensureOk(response).json()
}

export async function fetchCurrentFixture(): Promise<MatchSnapshot> {
  const response = await fetch(`${API_BASE}/fixtures/current`)
  const data = await ensureOk(response).json()
  return {
    fixtureId: data.fixture_id,
    homeTeam: data.home_team ?? data.home ?? 'Home',
    awayTeam: data.away_team ?? data.away ?? 'Away',
    score: data.score ?? '0-0',
    minute: Number(data.minute ?? 0),
    league: data.league,
    country: data.country,
    events: data.events ?? [],
    commentaryText: data.commentary_text,
  }
}

export async function stopFixture(): Promise<void> {
  const response = await fetch(`${API_BASE}/fixtures/stop`, { method: 'POST' })
  await ensureOk(response).json()
}

export async function fetchSignedUrl(): Promise<string> {
  const response = await fetch(`${API_BASE}/agent/signed-url`)
  const data = await ensureOk(response).json()
  return data.signed_url
}

export { API_BASE }
