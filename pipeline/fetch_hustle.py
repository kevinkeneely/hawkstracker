"""
Fetch league-wide hustle stats (one call, all players at once).

Hustle stats cover contested shots, deflections, charges drawn, screen
assists, loose balls, and box outs — none of which show up in base
box-score stats.

Saves raw to data/raw/<SEASON>/league_hustle_<date>.json for consumption
by transform_hustle.py.
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguehustlestatsplayer

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def run():
    print(f"[league-hustle] fetching league-wide hustle for {SEASON}")
    endpoint = fetch_with_retries(
        leaguehustlestatsplayer.LeagueHustleStatsPlayer,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_time="PerGame",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_json()  # keep NBA.com's native shape, like other files
    data = json.loads(raw)

    rs = data["resultSets"][0]
    row_count = len(rs["rowSet"])

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"league_hustle_{date.today().isoformat()}.json"
    out_path.write_text(json.dumps(data))

    print(f"[league-hustle] wrote {out_path} ({row_count} players)")


if __name__ == "__main__":
    run()