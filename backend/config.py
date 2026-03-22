import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
API_FOOTBALL_KEY = os.getenv("API_FOOTBALL_KEY")
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", 60))
SPORT = os.getenv("SPORT", "soccer")