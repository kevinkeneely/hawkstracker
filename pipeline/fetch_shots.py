"""Fetch shotchartdetail per Hawks player and save per-player raw files.

One API call per player (~25 calls = ~25s extra pipeline time).
Written to data/raw/<season>/shots_<player_id>_<date>.json.
"""

import json
import time
from datetime import date
from pathlib import Path

from pipeline import config  # noqa: F401 — triggers NBA.com header override
from nba_api.stats.endpoints import shotchartdetail

from pipeline.config import SEASON, RAW_DATA_DIR, ATLANTA_TEAM_ID
from pipeline.fetch import fetch_with_retries, TIMEOUT

RATE_LIMIT_SLEEP = 1.0


def _fetch_player_shots(player_id, season=SEASON, team_id=ATLANTA_TEAM_ID):
    """Fetch all regular-season shots for one player."""
    result = shotchartdetail.ShotChartDetail(
        team_id=team_id,
        player_id=player_id,
        season_nullable=season,
        season_type_all_star="Regular Season",
        context_measure_simple="FGA",  # all field-goal attempts
        timeout=TIMEOUT,
    )
    return result.get_dict()


def _load_hawks_player_ids():
    """Read the current hawksData.json to get the list of player IDs."""
    from pipeline.config import HAWKS_DATA_FILENAME
    with open(f"data/{HAWKS_DATA_FILENAME}") as f:
        return [p["id"] for p in json.load(f)["players"]]


def run():
    today = date.today().isoformat()
    out_dir = Path(RAW_DATA_DIR) / SEASON
    out_dir.mkdir(parents=True, exist_ok=True)

    player_ids = _load_hawks_player_ids()
    print(f"Fetching shot chart for {len(player_ids)} Hawks players ({SEASON})")

    for pid in player_ids:
        print(f"  → player {pid}... ", end="", flush=True)
        data = fetch_with_retries(_fetch_player_shots, pid)
        out_path = out_dir / f"shots_{pid}_{today}.json"
        with open(out_path, "w") as f:
            json.dump(data, f)
        rows = len(data["resultSets"][0]["rowSet"])
        print(f"saved {rows} shots → {out_path.name}")
        time.sleep(RATE_LIMIT_SLEEP)

    print("Done.")


if __name__ == "__main__":
    run()