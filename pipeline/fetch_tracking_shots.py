"""
Fetch league-wide player SHOOTING splits across six filter dimensions.

The NBA.com tracking API returns one slice at a time, so this script
makes six separate calls — one per filter — and writes each raw response
to its own file. transform_tracking_shooting.py then aggregates these
into the four categories we actually use on the frontend:

  - Catch & Shoot  = cs
  - Pull-Up        = pullup
  - Contested      = tight + close (0-2 Feet + 2-4 Feet, summed)
  - Uncontested    = open + wide    (4-6 Feet + 6+ Feet, summed)

Each call writes to:
  data/raw/<SEASON>/league_shots_<slug>_<date>.json

A 1-second sleep is inserted between calls to be polite to the NBA.com
API and avoid tripping rate limiting.
"""

import json
import time
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashplayerptshot

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON

# (slug, kwargs for the endpoint) — slug becomes part of the output filename
# so transform_tracking_shooting.py knows which filter produced each file.
FETCHES = [
    ("cs",     {"touch_time_range_nullable":    "Touch < 2 Seconds"}),
    ("pullup", {"touch_time_range_nullable":    "Touch 2-6 Seconds"}),
    ("tight",  {"close_def_dist_range_nullable": "0-2 Feet - Very Tight"}),
    ("close",  {"close_def_dist_range_nullable": "2-4 Feet - Tight"}),
    ("open",   {"close_def_dist_range_nullable": "4-6 Feet - Open"}),
    ("wide",   {"close_def_dist_range_nullable": "6+ Feet - Wide Open"}),
]


def run():
    print(f"[tracking-shots] fetching 6 shot splits for {SEASON}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    for i, (slug, extra_kwargs) in enumerate(FETCHES):
        label = extra_kwargs.get("touch_time_range_nullable") or extra_kwargs.get("close_def_dist_range_nullable")
        print(f"  [{i+1}/{len(FETCHES)}] {slug:7s} ← {label}")

        endpoint = fetch_with_retries(
            leaguedashplayerptshot.LeagueDashPlayerPtShot,
            season=SEASON,
            season_type_all_star="Regular Season",
            per_mode_simple="PerGame",
            timeout=TIMEOUT,
            **extra_kwargs,
        )
        raw = endpoint.get_json()
        data = json.loads(raw)
        rs = data["resultSets"][0]
        row_count = len(rs["rowSet"])

        out_path = OUT_DIR / f"league_shots_{slug}_{today}.json"
        out_path.write_text(json.dumps(data))
        print(f"       → {out_path.name} ({row_count} players)")

        # Be polite to NBA.com between calls. Skip the sleep after the last.
        if i < len(FETCHES) - 1:
            time.sleep(1)

    print(f"[tracking-shots] done — 6 files written to {OUT_DIR}/")


if __name__ == "__main__":
    run()
