"""
FastAPI backend for the Live Sports Commentator.
- REST endpoints for match selection and status
- WebSocket endpoint for real-time match event streaming
- Background poller task management
- Proxies ElevenLabs signed URL to frontend
- Alias routes for frontend compatibility
"""
import asyncio
import json
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn

from poller import get_live_fixtures, poll_match, match_state
from commentary import (
    get_or_create_agent,
    update_agent_context,
    get_signed_url,
    generate_event_commentary,
)

active_poller_task = None
connected_clients = []
agent_id = None
latest_snapshot = {}


@asynccontextmanager
async def lifespan(app):
    global agent_id
    agent_id = await get_or_create_agent()
    print("Agent ready: " + str(agent_id))
    yield
    if active_poller_task:
        active_poller_task.cancel()


app = FastAPI(title="Sports Commentator API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def broadcast(data):
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.remove(ws)


async def on_match_event(snapshot):
    global latest_snapshot
    latest_snapshot = snapshot

    await update_agent_context(agent_id, snapshot)

    audio_bytes = None
    if snapshot.get("new_events"):
        audio_bytes = await generate_event_commentary(snapshot)

    payload = {"type": "match_update", "data": snapshot}
    if audio_bytes:
        audio_b64 = base64.b64encode(audio_bytes).decode()
        await broadcast({"type": "commentary_audio", "audio_b64": audio_b64})

    await broadcast(payload)


# =============================================
# PRIMARY REST ENDPOINTS
# =============================================

@app.get("/fixtures/live")
async def list_live_fixtures_endpoint():
    fixtures = await get_live_fixtures()
    simplified = []
    for f in fixtures:
        simplified.append({
            "fixture_id": f["fixture"]["id"],
            "home": f["teams"]["home"]["name"],
            "away": f["teams"]["away"]["name"],
            "home_logo": f["teams"]["home"].get("logo", ""),
            "away_logo": f["teams"]["away"].get("logo", ""),
            "score": str(f["goals"]["home"]) + " - " + str(f["goals"]["away"]),
            "minute": f["fixture"]["status"]["elapsed"],
            "league": f["league"]["name"],
            "league_logo": f["league"].get("logo", ""),
            "country": f["league"]["country"],
            "status": f["fixture"]["status"]["short"],
        })
    return {"fixtures": simplified}


@app.post("/fixtures/{fixture_id}/start")
async def start_commentary(fixture_id, background_tasks=None):
    global active_poller_task

    fixture_id = int(fixture_id)

    if active_poller_task and not active_poller_task.done():
        active_poller_task.cancel()
        match_state.last_events = []
        match_state.enrichment_cache = {}
        match_state.match_context = {}

    active_poller_task = asyncio.create_task(
        poll_match(fixture_id, on_match_event)
    )
    return {"status": "started", "fixture_id": fixture_id, "agent_id": agent_id}


@app.get("/fixtures/current")
async def get_current_snapshot():
    if latest_snapshot:
        return latest_snapshot
    return {"message": "No active match"}


@app.post("/fixtures/stop")
async def stop_commentary():
    global active_poller_task
    if active_poller_task:
        active_poller_task.cancel()
        active_poller_task = None
    return {"status": "stopped"}


@app.get("/agent/signed-url")
async def get_agent_signed_url():
    if not agent_id:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    url = await get_signed_url(agent_id)
    return {"signed_url": url}


# =============================================
# ALIAS ROUTES (so frontend URLs also work)
# =============================================

@app.get("/api/matches")
async def alias_matches():
    return await list_live_fixtures_endpoint()


@app.post("/api/commentary/start/{fixture_id}")
async def alias_start(fixture_id):
    return await start_commentary(fixture_id)


@app.post("/api/commentary/stop/{fixture_id}")
async def alias_stop(fixture_id):
    return await stop_commentary()


@app.post("/api/commentary/stop")
async def alias_stop_no_id():
    return await stop_commentary()


@app.get("/api/signed-url")
async def alias_signed_url():
    return await get_agent_signed_url()


# =============================================
# WEBSOCKET: real-time match event stream
# =============================================

@app.websocket("/ws/match")
async def match_websocket(websocket):
    await websocket.accept()
    connected_clients.append(websocket)
    if latest_snapshot:
        await websocket.send_json({"type": "match_update", "data": latest_snapshot})
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        connected_clients.remove(websocket)


@app.websocket("/ws")
async def match_websocket_alias(websocket):
    await match_websocket(websocket)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)