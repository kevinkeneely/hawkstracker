"""
Fetch box scores for every played Hawks game and cache them per-game.

Reads: app/public/schedule.json (list of games)
Writes: app/public/boxscores/<game_id>.json (one file per game, raw)

Idempotent — skips any game whose box score file already exists.
First run on a fresh install fetches all played games (~2-5s per game,
plus 1s polite sleep). Subsequent nightly runs only fetch new games.

Must run AFTER transform_schedule.py.
"""

import json
import time
from pathlib import Path

from nba_api.stats.endpoints import boxscoretraditionalv2

from pipeline.fetch import TIMEOUT, fetch_with_retries

from pipeline.config import SCHEDULE_FILENAME
SCHEDULE_PATH = Path("app/public") / SCHEDULE_FILENAME
OUT_DIR = Path("app/public/boxscores")

# Polite delay between NBA API calls so we don't get rate-limited
SLEEP_BETWEEN_CALLS = 1.0


def fetch_one(game_id: str) -> dict:
    endpoint = fetch_with_retries(
        boxscoretraditionalv2.BoxScoreTraditionalV2,
        game_id=game_id,
        start_period=1,
        end_period=10,
        start_range=0,
        end_range=55800,
        range_type=2,
        timeout=TIMEOUT,
    )
    return json.loads(endpoint.get_json())


def run():
    if not SCHEDULE_PATH.exists():
        raise FileNotFoundError(
            f"{SCHEDULE_PATH} missing — run transform_schedule.py first"
        )
    schedule = json.loads(SCHEDULE_PATH.read_text())
    games = schedule.get("games", [])

    # Only played games have box scores
    played = [g for g in games if g.get("status_code") == 3]
    print(f"[boxscores] {len(played)} played games in schedule")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fetched = 0
    skipped = 0
    failed = 0

    for i, game in enumerate(played, 1):
        gid = game["game_id"]
        out_path = OUT_DIR / f"{gid}.json"
        if out_path.exists():
            skipped += 1
            continue

        label = f"{game.get('date')} {game.get('home_away')} {game.get('opp_tricode')}"
        print(f"[boxscores] ({i}/{len(played)}) fetching {gid} — {label}")
        try:
            data = fetch_one(gid)
            out_path.write_text(json.dumps(data))
            fetched += 1
            time.sleep(SLEEP_BETWEEN_CALLS)
        except Exception as e:
            print(f"[boxscores]   failed: {e}")
            failed += 1

    print(
        f"[boxscores] done — fetched {fetched} new, skipped {skipped} cached, "
        f"{failed} failed"
    )


if __name__ == "__main__":
    run()