"""
Fetch career stats for each Hawks player (one call per player).

NBA.com's `playercareerstats` endpoint returns:
  - SeasonTotalsRegularSeason — per-season rows (GP, PTS, REB, AST, etc.)
  - CareerTotalsRegularSeason — single row of lifetime totals

We save the raw JSON per player under data/raw/<season>/career_<player_id>_<date>.json
for transform_player_career.py to consume. Used by B3 (milestone tracker)
on the Insights tab.

Hawks roster is ~14 players → ~14 API calls → ~15s added to the pipeline.
"""

import json
import time
from datetime import date
from pathlib import Path

from pipeline import config  # noqa: F401 — triggers NBA.com header override
from nba_api.stats.endpoints import playercareerstats

from pipeline.config import SEASON, RAW_DATA_DIR, HAWKS_DATA_FILENAME
from pipeline.fetch import fetch_with_retries, TIMEOUT

RATE_LIMIT_SLEEP = 1.0


def _fetch_career(player_id):
    """Fetch full career stats for one player."""
    result = fetch_with_retries(
        playercareerstats.PlayerCareerStats,
        player_id=player_id,
        per_mode36="Totals",   # we want raw totals, not per-36
        timeout=TIMEOUT,
    )
    return result.get_dict()


def _load_hawks_player_ids():
    """Read the current hawksData.json to get the Hawks roster."""
    with open(f"data/{HAWKS_DATA_FILENAME}") as f:
        return [(p["id"], p["name"]) for p in json.load(f)["players"]]


def run():
    today = date.today().isoformat()
    out_dir = Path(RAW_DATA_DIR) / SEASON
    out_dir.mkdir(parents=True, exist_ok=True)

    roster = _load_hawks_player_ids()
    print(f"[player-career] fetching career stats for {len(roster)} Hawks players")

    ok = 0
    for pid, name in roster:
        print(f"  → {name} ({pid})... ", end="", flush=True)
        try:
            data = _fetch_career(pid)
            out_path = out_dir / f"career_{pid}_{today}.json"
            out_path.write_text(json.dumps(data))
            print("ok")
            ok += 1
        except Exception as e:
            print(f"FAILED: {e}")
        time.sleep(RATE_LIMIT_SLEEP)

    print(f"[player-career] wrote {ok}/{len(roster)} player career files")


if __name__ == "__main__":
    run()
