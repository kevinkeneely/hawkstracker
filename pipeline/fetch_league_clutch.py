"""
Fetch league-wide clutch stats (base + advanced measure types) for
percentile calculations.

The existing clutch_<date>.json and clutch_adv_<date>.json files are
Hawks-only (17-25 rows); for percentiles we need all ~500 players.

Saves two raw files per run:
  data/raw/<SEASON>/league_clutch_<date>.json       (base measure)
  data/raw/<SEASON>/league_clutch_adv_<date>.json   (advanced measure)
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashplayerclutch

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON

# NBA's canonical clutch definition
CLUTCH_PARAMS = {
    "clutch_time": "Last 5 Minutes",
    "ahead_behind": "Ahead or Behind",
    "point_diff": 5,
    "season": SEASON,
    "season_type_all_star": "Regular Season",
    "per_mode_detailed": "PerGame",
}


def fetch_measure(measure_type: str, filename: str) -> int:
    """Fetch one measure type (Base or Advanced), save raw, return row count."""
    print(f"[league-clutch] fetching {measure_type}…")
    endpoint = fetch_with_retries(
        leaguedashplayerclutch.LeagueDashPlayerClutch,
        measure_type_detailed_defense=measure_type,
        **CLUTCH_PARAMS,
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())
    row_count = len(data["resultSets"][0]["rowSet"])

    out_path = OUT_DIR / filename
    out_path.write_text(json.dumps(data))
    print(f"[league-clutch] wrote {out_path} ({row_count} players)")
    return row_count


def run():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    fetch_measure("Base", f"league_clutch_{today}.json")
    fetch_measure("Advanced", f"league_clutch_adv_{today}.json")


if __name__ == "__main__":
    run()