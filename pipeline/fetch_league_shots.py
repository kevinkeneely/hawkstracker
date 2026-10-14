"""
Fetch league-wide shot data (every active player, every shot).

Used to compute the league FG% baseline for the hex shot chart.
Called nightly by scripts/daily-refresh.sh.
"""

import json
import time
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import commonallplayers, shotchartdetail

from pipeline.config import SEASON  # e.g. "2025-26"
from pipeline.fetch import TIMEOUT, fetch_with_retries

RAW_DIR = Path("data/raw") / SEASON / "league_shots"
SLEEP_BETWEEN_CALLS = 0.6  # polite spacing — 0.6s × 500 players ≈ 5 min of pure sleep


def get_active_player_ids() -> list[dict]:
    """Call commonallplayers, return list of {id, name} for active-roster players."""
    print(f"[league-shots] fetching player roster for {SEASON}")
    endpoint = fetch_with_retries(
        commonallplayers.CommonAllPlayers,
        is_only_current_season=1,  # only players on a roster this season
        season=SEASON,
        timeout=TIMEOUT,
    )
    rows = endpoint.get_normalized_dict()["CommonAllPlayers"]
    # ROSTERSTATUS: 1 = currently on an active roster, 0 = not
    active = [
        {"id": r["PERSON_ID"], "name": r["DISPLAY_FIRST_LAST"], "team_id": r["TEAM_ID"]}
        for r in rows
        if r.get("ROSTERSTATUS") == 1 and r.get("TEAM_ID")  # TEAM_ID 0 means no team
    ]
    print(f"[league-shots] {len(active)} active players on rosters")
    return active


def fetch_player_shots(player: dict, today: str) -> int:
    """Fetch shots for one player, save raw JSON. Return shot count."""
    out_path = RAW_DIR / f"shots_{player['id']}_{today}.json"

    endpoint = fetch_with_retries(
        shotchartdetail.ShotChartDetail,
        player_id=player["id"],
        team_id=player["team_id"],
        season_nullable=SEASON,
        season_type_all_star="Regular Season",
        context_measure_simple="FGA",
        timeout=TIMEOUT,
    )
    raw = endpoint.get_normalized_dict()
    shots = raw.get("Shot_Chart_Detail", [])

    # Skip saving if the player hasn't taken any shots yet
    if not shots:
        return 0

    out_path.write_text(json.dumps(raw))
    return len(shots)


def run():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    players = get_active_player_ids()
    total_shots = 0
    skipped = 0
    failed = 0

    start = time.time()
    for i, player in enumerate(players, 1):
        try:
            n = fetch_player_shots(player, today)
            total_shots += n
            if n == 0:
                skipped += 1
            if i % 25 == 0 or i == len(players):
                elapsed = time.time() - start
                print(
                    f"[league-shots] {i}/{len(players)} "
                    f"({total_shots:,} shots, {skipped} empty, {failed} failed, "
                    f"{elapsed:.0f}s elapsed)"
                )
        except Exception as e:
            failed += 1
            print(f"[league-shots] FAILED {player['name']} ({player['id']}): {e}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    print(
        f"[league-shots] done: {total_shots:,} total shots from "
        f"{len(players) - skipped - failed} players ({failed} failed, {skipped} empty)"
    )


if __name__ == "__main__":
    run()