"""
Fetch league-wide player tracking POSSESSIONS stats (touches, time of
possession, by-zone touch counts).

Includes TOUCHES (total touches per game), TIME_OF_POSS (seconds the
player holds the ball), average seconds/dribbles per touch, points per
touch, and per-zone touch counts (elbow, post, paint).

Saves raw to data/raw/<SEASON>/league_possessions_<date>.json for
consumption by transform_tracking_playmaking.py.
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashptstats

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def run():
    print(f"[tracking-possessions] fetching league-wide possessions for {SEASON}")
    endpoint = fetch_with_retries(
        leaguedashptstats.LeagueDashPtStats,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_simple="PerGame",
        pt_measure_type="Possessions",
        player_or_team="Player",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_json()
    data = json.loads(raw)

    rs = data["resultSets"][0]
    row_count = len(rs["rowSet"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"league_possessions_{date.today().isoformat()}.json"
    out_path.write_text(json.dumps(data))

    print(f"[tracking-possessions] wrote {out_path} ({row_count} players)")


if __name__ == "__main__":
    run()
