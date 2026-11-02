"""
Fetch league-wide player tracking PASSING stats.

Covers each player's per-game passes made/received, potential assists
(passes that led to a shot regardless of outcome), assist points created,
and the ratio of passes that become assists.

Saves raw to data/raw/<SEASON>/league_passing_<date>.json for consumption
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
    print(f"[tracking-passing] fetching league-wide passing for {SEASON}")
    endpoint = fetch_with_retries(
        leaguedashptstats.LeagueDashPtStats,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_simple="PerGame",
        pt_measure_type="Passing",
        player_or_team="Player",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_json()
    data = json.loads(raw)

    rs = data["resultSets"][0]
    row_count = len(rs["rowSet"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"league_passing_{date.today().isoformat()}.json"
    out_path.write_text(json.dumps(data))

    print(f"[tracking-passing] wrote {out_path} ({row_count} players)")


if __name__ == "__main__":
    run()
