"""
Fetch league-wide player tracking DRIVES stats.

Drives are possessions where a player attacks the basket off the dribble.
This endpoint returns one row per player with their per-game drive volume,
efficiency (DRIVE_FG_PCT), scoring (DRIVE_PTS), and playmaking (DRIVE_AST,
DRIVE_TOV).

Saves raw to data/raw/<SEASON>/league_drives_<date>.json for consumption
by transform_tracking_playmaking.py.
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashptstats

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def run():
    print(f"[tracking-drives] fetching league-wide drives for {SEASON}")
    endpoint = fetch_with_retries(
        leaguedashptstats.LeagueDashPtStats,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_simple="PerGame",
        pt_measure_type="Drives",
        player_or_team="Player",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_json()
    data = json.loads(raw)

    rs = data["resultSets"][0]
    row_count = len(rs["rowSet"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"league_drives_{date.today().isoformat()}.json"
    out_path.write_text(json.dumps(data))

    print(f"[tracking-drives] wrote {out_path} ({row_count} players)")


if __name__ == "__main__":
    run()
