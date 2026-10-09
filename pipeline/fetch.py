"""
Hawks data pipeline — fetch raw stats from NBA.com API.

Pulls each endpoint listed in config.ENDPOINTS, sleeps between calls to
respect rate limits, and saves raw JSON responses to data/raw/<season>/.

Run from the project root:
    python3 pipeline/fetch.py
"""

import json
import os
import time
from datetime import date

from nba_api.stats.endpoints import (
    leaguedashplayerstats,
    leaguehustlestatsplayer,
    leaguedashplayerclutch,
)

from pipeline.config import (
    ATLANTA_TEAM_ID,
    SEASON,
    RAW_DATA_DIR,
    ENDPOINTS,
)

# Seconds to wait between API calls (NBA.com rate limiting)
RATE_LIMIT_SLEEP = 1.0


def fetch_endpoint(friendly_name, measure_type, season=SEASON, team_id=ATLANTA_TEAM_ID):
    """Call the right NBA API endpoint based on friendly_name. Return raw dict."""
    if friendly_name == "hustle":
        result = leaguehustlestatsplayer.LeagueHustleStatsPlayer(
            season=season,
            team_id_nullable=team_id,
            per_mode_time="PerGame",
        )
    elif friendly_name.startswith("clutch"):
        result = leaguedashplayerclutch.LeagueDashPlayerClutch(
            season=season,
            team_id_nullable=team_id,
            per_mode_detailed="PerGame",
            measure_type_detailed_defense=measure_type,
        )
    else:
        result = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            team_id_nullable=team_id,
            per_mode_detailed="PerGame",
            measure_type_detailed_defense=measure_type,
        )
    return result.get_dict()


def save_raw(data, friendly_name, season=SEASON):
    """Write the raw API response to data/raw/<season>/<friendly_name>_<date>.json."""
    today = date.today().isoformat()  # e.g. "2026-10-09"
    out_dir = os.path.join(RAW_DATA_DIR, season)
    os.makedirs(out_dir, exist_ok=True)
    filename = f"{friendly_name}_{today}.json"
    out_path = os.path.join(out_dir, filename)
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    return out_path


def run():
    """Fetch all endpoints and save them to disk."""
    print(f"Fetching Hawks data for {SEASON}")
    print(f"Endpoints to pull: {len(ENDPOINTS)}")

    for friendly_name, measure_type in ENDPOINTS:
        print(f"  → {friendly_name} ({measure_type})... ", end="", flush=True)
        data = fetch_endpoint(friendly_name, measure_type)
        out_path = save_raw(data, friendly_name)
        rows = len(data["resultSets"][0]["rowSet"])
        print(f"saved {rows} rows → {out_path}")
        time.sleep(RATE_LIMIT_SLEEP)

    print("Done.")


if __name__ == "__main__":
    run()