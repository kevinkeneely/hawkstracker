"""
Fetch per-game defensive matchup stats for every played Hawks game and cache
them per-game.

Reads: app/public/schedule.json (list of games)
Writes: app/public/boxscores/<game_id>-defensive.json (one file per game, raw)

Idempotent — skips any game whose defensive matchup file already exists.
Must run AFTER transform_schedule.py.

Part of Phase 4 (Box Score tabs). See claude/advanced-stats-plan.md.
"""

import json
import time
from pathlib import Path

from nba_api.stats.endpoints import boxscoredefensivev2

from pipeline.fetch import TIMEOUT, fetch_with_retries

from pipeline.config import SCHEDULE_FILENAME
SCHEDULE_PATH = Path("app/public") / SCHEDULE_FILENAME
OUT_DIR = Path("app/public/boxscores")

SLEEP_BETWEEN_CALLS = 1.0


def fetch_one(game_id: str) -> dict:
    endpoint = fetch_with_retries(
        boxscoredefensivev2.BoxScoreDefensiveV2,
        game_id=game_id,
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
    played = [g for g in games if g.get("status_code") == 3]
    print(f"[boxscore-defensive] {len(played)} played games in schedule")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    fetched = 0
    skipped = 0
    failed = 0

    for i, game in enumerate(played, 1):
        gid = game["game_id"]
        out_path = OUT_DIR / f"{gid}-defensive.json"
        if out_path.exists():
            skipped += 1
            continue

        label = f"{game.get('date')} {game.get('home_away')} {game.get('opp_tricode')}"
        print(f"[boxscore-defensive] ({i}/{len(played)}) fetching {gid} — {label}")
        try:
            data = fetch_one(gid)
            out_path.write_text(json.dumps(data))
            fetched += 1
            time.sleep(SLEEP_BETWEEN_CALLS)
        except Exception as e:
            print(f"[boxscore-defensive]   failed: {e}")
            failed += 1

    print(
        f"[boxscore-defensive] done — fetched {fetched} new, skipped {skipped} cached, "
        f"{failed} failed"
    )


if __name__ == "__main__":
    run()
