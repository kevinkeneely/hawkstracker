"""
Hawks data pipeline — fetch raw stats from NBA.com API.

Pulls each endpoint listed in config.PLAYER_ENDPOINTS and config.TEAM_ENDPOINTS,
sleeps between calls to respect rate limits, and saves raw JSON responses to
data/raw/<season>/.

Run from the project root:
    python3 pipeline/fetch.py
"""

import json
import os
import time
from datetime import date

from requests.exceptions import RequestException

from nba_api.stats.endpoints import (
    leaguedashplayerstats,
    leaguehustlestatsplayer,
    leaguedashplayerclutch,
    leaguedashteamstats,
    leaguedashteamshotlocations,
)

from pipeline.config import (
    ATLANTA_TEAM_ID,
    SEASON,
    RAW_DATA_DIR,
    PLAYER_ENDPOINTS,
    TEAM_ENDPOINTS,
)

from nba_api.stats.endpoints import (
    leaguedashplayerstats,
    leaguehustlestatsplayer,
    leaguedashplayerclutch,
    leaguedashteamstats,
    leaguedashteamshotlocations,
    commonteamroster,
)

# Seconds to wait between API calls (NBA.com rate limiting)
RATE_LIMIT_SLEEP = 1.0

# Longer timeout per endpoint — NBA.com can be slow from datacenter IPs.
TIMEOUT = 90

# Retry a failed endpoint this many times before giving up.
MAX_RETRIES = 3

# Seconds to wait between retry attempts.
RETRY_SLEEP = 10

def fetch_endpoint(friendly_name, measure_type, season=SEASON, team_id=ATLANTA_TEAM_ID):
    """Call the right NBA API endpoint based on friendly_name. Return raw dict."""
    if friendly_name == "hustle":
        result = leaguehustlestatsplayer.LeagueHustleStatsPlayer(
            season=season,
            team_id_nullable=team_id,
            per_mode_time="PerGame",
            timeout=TIMEOUT,
        )
    elif friendly_name.startswith("clutch"):
        result = leaguedashplayerclutch.LeagueDashPlayerClutch(
            season=season,
            team_id_nullable=team_id,
            per_mode_detailed="PerGame",
            measure_type_detailed_defense=measure_type,
            timeout=TIMEOUT,
        )
    else:
        result = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            team_id_nullable=team_id,
            per_mode_detailed="PerGame",
            measure_type_detailed_defense=measure_type,
            timeout=TIMEOUT,
        )
    return result.get_dict()


def fetch_team_endpoint(friendly_name, measure_type, season=SEASON):
    """Call the right NBA team-level endpoint based on friendly_name. Return raw dict."""
    if friendly_name.startswith("team_shot_locations"):
        # Shot-location data: FG% by zone (rim, mid, 3PT, etc.)
        # measure_type is "Base" (team's own shots) or "Opponent" (defensive FG% allowed by zone)
        result = leaguedashteamshotlocations.LeagueDashTeamShotLocations(
            season=season,
            per_mode_detailed="PerGame",
            measure_type_simple=measure_type,
            timeout=TIMEOUT,
        )
    else:
        result = leaguedashteamstats.LeagueDashTeamStats(
            season=season,
            per_mode_detailed="PerGame",
            measure_type_detailed_defense=measure_type,
            timeout=TIMEOUT,
        )
    return result.get_dict()

def _fetch_league_base(season=SEASON):
    """League-wide player base stats (no team filter) — for percentile computation."""
    result = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        per_mode_detailed="PerGame",
        measure_type_detailed_defense="Base",
        timeout=TIMEOUT,
    )
    return result.get_dict()

def _fetch_team_roster(season=SEASON, team_id=ATLANTA_TEAM_ID):
    """Hawks roster with positions (not in leaguedashplayerstats)."""
    result = commonteamroster.CommonTeamRoster(
        team_id=team_id,
        season=season,
        timeout=TIMEOUT,
    )
    return result.get_dict()

def fetch_with_retries(fetch_fn, *args, **kwargs):
    """Call a fetch_* function with retries on network errors.
    Retries MAX_RETRIES times with RETRY_SLEEP seconds between attempts.
    Re-raises the last error if all attempts fail."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fetch_fn(*args, **kwargs)
        except RequestException as e:
            last_error = e
            if attempt < MAX_RETRIES:
                print(
                    f"attempt {attempt} failed ({type(e).__name__}), "
                    f"retrying in {RETRY_SLEEP}s... ",
                    end="", flush=True,
                )
                time.sleep(RETRY_SLEEP)
            else:
                print(f"attempt {attempt} failed, giving up.")
    raise last_error

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


def count_rows(data):
    """Return the number of rows in a raw API response, tolerating both shapes.
    Most endpoints return resultSets as a list of result sets; shot_locations
    returns it as a single dict.
    """
    rs = data["resultSets"]
    return len(rs["rowSet"] if isinstance(rs, dict) else rs[0]["rowSet"])


def run():
    """Fetch all endpoints and save them to disk."""
    print(f"Fetching Hawks data for {SEASON}")

    print(f"Player endpoints: {len(PLAYER_ENDPOINTS)}")
    for friendly_name, measure_type in PLAYER_ENDPOINTS:
        print(f"  → {friendly_name} ({measure_type})... ", end="", flush=True)
        data = fetch_with_retries(fetch_endpoint, friendly_name, measure_type)
        out_path = save_raw(data, friendly_name)
        rows = count_rows(data)
        print(f"saved {rows} rows → {out_path}")
        time.sleep(RATE_LIMIT_SLEEP)

    print(f"Team endpoints: {len(TEAM_ENDPOINTS)}")
    for friendly_name, measure_type in TEAM_ENDPOINTS:
        print(f"  → {friendly_name} ({measure_type})... ", end="", flush=True)
        data = fetch_with_retries(fetch_team_endpoint, friendly_name, measure_type)
        out_path = save_raw(data, friendly_name)
        rows = count_rows(data)
        print(f"saved {rows} rows → {out_path}")
        time.sleep(RATE_LIMIT_SLEEP)

    # League-wide base stats (all ~500 NBA players, no team filter).
    # Needed to compute percentile rankings for Hawks players.
    print("League-wide: 1")
    print("  → league_base (Base)... ", end="", flush=True)
    data = fetch_with_retries(_fetch_league_base)
    out_path = save_raw(data, "league_base")
    rows = count_rows(data)
    print(f"saved {rows} rows → {out_path}")

    # Hawks roster — for POSITION field (not returned by leaguedashplayerstats)
    print("Roster: 1")
    print("  → team_roster... ", end="", flush=True)
    data = fetch_with_retries(_fetch_team_roster)
    out_path = save_raw(data, "team_roster")
    rows = count_rows(data)
    print(f"saved {rows} rows → {out_path}")
    
    print("Done.")


if __name__ == "__main__":
    run()