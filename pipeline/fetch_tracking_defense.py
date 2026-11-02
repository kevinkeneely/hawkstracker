"""
Fetch league-wide player tracking DEFENSIVE FG% ALLOWED.

Each row shows how opponents shot when the player was the closest
defender. Key columns: D_FGA (field goals attempted vs this defender),
D_FG_PCT (opponent FG% when defended by this player), NORMAL_FG_PCT
(what those shooters normally shoot overall), PCT_PLUSMINUS (the gap —
negative means the defender is suppressing shots below opponents' usual
rate = good defender).

Saves raw to data/raw/<SEASON>/league_defense_tracking_<date>.json for
consumption by transform_tracking_defense.py.
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashptdefend

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def run():
    print(f"[tracking-defense] fetching league-wide defensive FG% allowed for {SEASON}")
    endpoint = fetch_with_retries(
        leaguedashptdefend.LeagueDashPtDefend,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_simple="PerGame",
        defense_category="Overall",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_json()
    data = json.loads(raw)

    rs = data["resultSets"][0]
    row_count = len(rs["rowSet"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"league_defense_tracking_{date.today().isoformat()}.json"
    out_path.write_text(json.dumps(data))

    print(f"[tracking-defense] wrote {out_path} ({row_count} players)")


if __name__ == "__main__":
    run()
