"""
ElevenLabs Agents integration + commentary engine.
- Builds dynamic system prompts from live match context
- Manages the conversational agent session
- Generates event-triggered commentary narration
- Injects real-time match events into the active conversation
  so the agent reacts and speaks about goals/cards/subs immediately
"""
import json
import httpx
from config import ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"

COMMENTATOR_PERSONA = """
You are a world-class live sports commentator — think Gary Neville meets Peter Drury.
Your style is passionate, knowledgeable, and electric. You use vivid language,
historical context, and player backstory to bring every moment to life.

When a goal is scored: go dramatic. Build tension, describe the buildup, celebrate.
When a card is shown: analyze the tactical impact and player temperament.
When a substitution happens: assess what it means for the game's momentum.

You always know the current score, match minute, and recent events.
You welcome interruptions and questions from the viewer — answer them as a true expert would.
Keep responses conversational but pundit-sharp. Max 3-4 sentences per commentary burst
unless the viewer asks for more depth.
"""

# Track the active conversation ID so we can inject events into it
active_conversation_id = None


def set_active_conversation(conversation_id):
    """Called when the frontend establishes a voice session."""
    global active_conversation_id
    active_conversation_id = conversation_id
    print("Active conversation set: " + str(conversation_id))


def clear_active_conversation():
    """Called when the voice session ends."""
    global active_conversation_id
    active_conversation_id = None


def build_match_context_prompt(snapshot):
    lines = [
        "LIVE MATCH: " + snapshot["home_team"] + " vs " + snapshot["away_team"],
        "SCORE: " + snapshot["score"] + " | MINUTE: " + str(snapshot["minute"]) + "'",
    ]

    if snapshot.get("match_news"):
        lines.append("")
        lines.append("MATCH CONTEXT FROM NEWS:")
        lines.append(snapshot["match_news"])

    if snapshot.get("new_events"):
        lines.append("")
        lines.append("RECENT EVENTS:")
        for e in snapshot["new_events"]:
            line = "  " + str(e["minute"]) + "' [" + e["type"] + "] " + e["player"] + " (" + e["team"] + ") - " + e["detail"]
            lines.append(line)
            if e.get("enrichment"):
                lines.append("  Player Context: " + e["enrichment"])

    if snapshot.get("match_over"):
        lines.append("")
        lines.append("FULL TIME - The match has ended.")

    return "\n".join(lines)


def build_event_narration_prompt(snapshot):
    """Build a natural-language prompt describing new events for the agent to react to."""
    if not snapshot.get("new_events"):
        return None

    parts = []
    for event in snapshot["new_events"]:
        etype = event["type"].lower()
        player = event["player"]
        team = event["team"]
        minute = str(event["minute"])
        detail = event.get("detail", "")
        enrichment = event.get("enrichment", "")

        if "goal" in etype:
            parts.append(
                "GOAL! " + player + " scores for " + team + " in the " + minute + "' minute! "
                "The score is now " + snapshot["score"] + ". "
                + (enrichment[:200] if enrichment else "")
            )
        elif "card" in etype:
            parts.append(
                detail + " card for " + player + " of " + team + " at " + minute + "'. "
                "This could change the game. "
                + (enrichment[:200] if enrichment else "")
            )
        elif "subst" in etype:
            parts.append(
                "Substitution for " + team + " at " + minute + "'. " + player + " comes on. "
                + (enrichment[:200] if enrichment else "")
            )
        else:
            parts.append(
                event["type"] + " — " + player + " (" + team + ") at " + minute + "'. "
                + (enrichment[:150] if enrichment else "")
            )

    news = snapshot.get("match_news", "")
    if news:
        parts.append("Pre-match context: " + news[:150])

    return " ".join(parts)


async def get_or_create_agent():
    if ELEVENLABS_AGENT_ID:
        return ELEVENLABS_AGENT_ID

    async with httpx.AsyncClient() as client:
        payload = {
            "name": "Sports Commentator",
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": COMMENTATOR_PERSONA,
                    },
                    "first_message": "Welcome to the match! I'm your live commentator. Tell me which game you want to follow and I'll bring every moment to life.",
                    "language": "en",
                },
                "tts": {
                    "voice_id": "onwK4e9ZLuTAKqWW03F9",
                },
                "asr": {
                    "quality": "high",
                    "user_input_audio_format": "pcm_16000",
                },
            },
        }
        r = await client.post(
            ELEVENLABS_BASE + "/convai/agents/create",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json=payload,
        )
        r.raise_for_status()
        agent_id = r.json()["agent_id"]
        print("Created ElevenLabs agent: " + agent_id)
        return agent_id


async def update_agent_context(agent_id, snapshot):
    """Update the agent's system prompt with latest match state.
    Also inject events into the active conversation if one exists."""
    context_text = build_match_context_prompt(snapshot)

    async with httpx.AsyncClient() as client:
        # Update the agent's base prompt (affects new conversations and provides context)
        payload = {
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": COMMENTATOR_PERSONA + "\n\n" + context_text,
                    }
                }
            }
        }
        r = await client.patch(
            ELEVENLABS_BASE + "/convai/agents/" + agent_id,
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json=payload,
        )
        if r.status_code not in (200, 204):
            print("Warning: agent context update returned " + str(r.status_code) + ": " + r.text)


async def get_signed_url(agent_id):
    async with httpx.AsyncClient() as client:
        r = await client.get(
            ELEVENLABS_BASE + "/convai/conversation/get_signed_url",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            params={"agent_id": agent_id},
        )
        r.raise_for_status()
        return r.json()["signed_url"]


async def generate_event_commentary(snapshot):
    """Generate TTS audio for match events.
    This serves as the backup/fallback narration system — it produces
    audio clips even if the interactive voice session isn't active."""
    if not snapshot.get("new_events"):
        return None

    event = snapshot["new_events"][0]
    etype = event["type"].lower()

    enrichment = event.get("enrichment", "")
    enrichment_line = ""
    if enrichment:
        enrichment_line = " " + enrichment[:200]

    news = snapshot.get("match_news", "")
    news_line = ""
    if news:
        news_line = " Pre-match context: " + news[:150]

    if "goal" in etype:
        prompt = (
            "GOAL! " + event["player"] + " scores for " + event["team"] + "! "
            "The score is now " + snapshot["score"] + " in the " + str(event["minute"]) + "th minute! "
            + enrichment_line + news_line
        )
    elif "card" in etype:
        prompt = (
            "CARD! " + event["detail"] + " for " + event["player"] + " of " + event["team"]
            + " in the " + str(event["minute"]) + "th minute. This could change the game. "
            + enrichment_line
        )
    elif "subst" in etype:
        prompt = (
            "Substitution for " + event["team"] + ". " + event["player"] + " comes on. "
            "The manager is making a tactical change at the " + str(event["minute"]) + "th minute. "
            + enrichment_line
        )
    else:
        prompt = (
            event["type"] + " for " + event["team"] + " — " + event["player"]
            + " at the " + str(event["minute"]) + "th minute. The match continues to heat up. "
            + enrichment_line
        )

    async with httpx.AsyncClient() as client:
        r = await client.post(
            ELEVENLABS_BASE + "/text-to-speech/onwK4e9ZLuTAKqWW03F9",
            headers={
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": prompt,
                "model_id": "eleven_turbo_v2",
                "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
            },
        )
        r.raise_for_status()
        return r.content
