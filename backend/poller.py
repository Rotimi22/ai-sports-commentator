"""
Live match data poller.
Primary source: API-Football (structured, reliable, free tier)
Enrichment: Firecrawl (player profiles, news, narrative context)
"""
import httpx
import asyncio
from datetime import datetime

from firecrawl import FirecrawlApp
from config import FIRECRAWL_API_KEY, API_FOOTBALL_KEY, POLL_INTERVAL_SECONDS

firecrawl = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

FOOTBALL_API_BASE = "https://v3.football.api-sports.io"
HEADERS = {"x-apisports-key": API_FOOTBALL_KEY}


class MatchState:
    def __init__(self):
        self.fixture_id = None
        self.last_events = []
        self.match_context = {}
        self.enrichment_cache = {}

    def get_new_events(self, current_events):
        known = set()
        for e in self.last_events:
            player_name = None
            player_data = e.get("player")
            if player_data:
                player_name = player_data.get("name")
            known.add((e["time"]["elapsed"], e["type"], player_name))

        new = []
        for e in current_events:
            player_name = None
            player_data = e.get("player")
            if player_data:
                player_name = player_data.get("name")
            if (e["time"]["elapsed"], e["type"], player_name) not in known:
                new.append(e)

        self.last_events = current_events
        return new


match_state = MatchState()


async def get_live_fixtures():
    async with httpx.AsyncClient() as client:
        r = await client.get(
            FOOTBALL_API_BASE + "/fixtures",
            headers=HEADERS,
            params={"live": "all"},
        )
        r.raise_for_status()
        return r.json().get("response", [])


async def get_fixture_detail(fixture_id):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            FOOTBALL_API_BASE + "/fixtures",
            headers=HEADERS,
            params={"id": fixture_id},
        )
        r.raise_for_status()
        data = r.json().get("response", [])
        if data:
            return data[0]
        return {}


async def get_player_stats(fixture_id):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            FOOTBALL_API_BASE + "/fixtures/players",
            headers=HEADERS,
            params={"fixture": fixture_id},
        )
        r.raise_for_status()
        return r.json().get("response", [])


def enrich_player_with_firecrawl(player_name, team):
    cache_key = player_name + ":" + team
    if cache_key in match_state.enrichment_cache:
        return match_state.enrichment_cache[cache_key]

    try:
        query = player_name + " " + team + " footballer stats career"
        result = firecrawl.search(query, params={"limit": 2})
        if result and result.get("data"):
            snippets = []
            for item in result["data"]:
                text = item.get("description", "")
                if not text:
                    text = item.get("markdown", "")[:300]
                snippets.append(text)
            context = " ".join(snippets)[:600]
            match_state.enrichment_cache[cache_key] = context
            return context
    except Exception as e:
        print("Firecrawl enrichment failed for " + player_name + ": " + str(e))

    return ""


def enrich_match_news(home_team, away_team):
    try:
        query = home_team + " vs " + away_team + " match preview news"
        result = firecrawl.search(query, params={"limit": 3})
        if result and result.get("data"):
            snippets = []
            for item in result["data"]:
                text = item.get("description", "")
                if not text:
                    text = item.get("markdown", "")[:300]
                snippets.append(text)
            return " ".join(snippets)[:800]
    except Exception as e:
        print("Firecrawl news enrichment failed: " + str(e))
    return ""


async def format_match_snapshot(fixture, events, new_events):
    teams = fixture.get("teams", {})
    score = fixture.get("goals", {})
    status = fixture.get("fixture", {}).get("status", {})

    home = teams.get("home", {}).get("name", "Home")
    away = teams.get("away", {}).get("name", "Away")
    home_score = score.get("home", 0)
    away_score = score.get("away", 0)
    minute = status.get("elapsed", 0)

    formatted_events = []
    for e in new_events:
        player = e.get("player", {}).get("name", "Unknown")
        team = e.get("team", {}).get("name", "")
        etype = e.get("type", "")
        detail = e.get("detail", "")
        elapsed = e.get("time", {}).get("elapsed", minute)

        enrichment = await asyncio.to_thread(enrich_player_with_firecrawl, player, team)

        formatted_events.append({
            "minute": elapsed,
            "type": etype,
            "detail": detail,
            "player": player,
            "team": team,
            "enrichment": enrichment,
        })

    return {
        "home_team": home,
        "away_team": away,
        "score": str(home_score) + " - " + str(away_score),
        "minute": minute,
        "new_events": formatted_events,
        "timestamp": datetime.utcnow().isoformat(),
    }


async def poll_match(fixture_id, callback):
    match_state.fixture_id = fixture_id
    print("Starting poller for fixture " + str(fixture_id) + ", interval=" + str(POLL_INTERVAL_SECONDS) + "s")

    while True:
        try:
            fixture = await get_fixture_detail(fixture_id)
            if not fixture:
                print("Fixture not found or ended.")
                break

            all_events = fixture.get("events", [])
            new_events = match_state.get_new_events(all_events)

            status = fixture.get("fixture", {}).get("status", {}).get("short", "")
            if status in ("FT", "AET", "PEN"):
                snapshot = await format_match_snapshot(fixture, all_events, new_events)
                snapshot["match_over"] = True
                await callback(snapshot)
                print("Match finished.")
                break

            if new_events or not match_state.last_events:
                snapshot = await format_match_snapshot(fixture, all_events, new_events)
                snapshot["match_over"] = False

                if not match_state.match_context.get("news_loaded"):
                    news = await asyncio.to_thread(
                        enrich_match_news, snapshot["home_team"], snapshot["away_team"]
                    )
                    if news:
                        snapshot["match_news"] = news
                        match_state.match_context["news_loaded"] = True

                await callback(snapshot)

        except Exception as e:
            print("Poller error: " + str(e))

        await asyncio.sleep(POLL_INTERVAL_SECONDS)