"""
Fetch the full NBA season schedule (past + future) from stats.nba.com
via nba_api's ScheduleLeagueV2 wrapper.

transform_schedule.py filters to Hawks and merges with completed-game
data from fetch_schedule.py.

Saves: data/raw/<SEASON>/schedule_upcoming_<date>.json
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import scheduleleaguev2

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def run():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    print(f"[upcoming] fetching ScheduleLeagueV2 for {SEASON}…")

    endpoint = fetch_with_retries(
        scheduleleaguev2.ScheduleLeagueV2,
        league_id="00",
        season=SEASON,
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())

    out_path = OUT_DIR / f"schedule_upcoming_{today}.json"
    out_path.write_text(json.dumps(data))

    # Sanity count
    all_dates = data.get("leagueSchedule", {}).get("gameDates", [])
    total = sum(len(d.get("games", [])) for d in all_dates)
    print(f"[upcoming] wrote {out_path} ({total} total league games)")


if __name__ == "__main__":
    run()