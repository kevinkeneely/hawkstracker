"""
Extract per-player triple-double count (TD3) from the latest league_base
raw file and merge onto each Hawks player in hawksData-<SEASON>.json as
`td3_total`. Used by the Milestones to Watch widget (B3 phase 3) on the
Insights tab.

NBA.com's `leaguedashplayerstats` already returns a TD3 column we were
ignoring. No new fetch needed — we just pull the number out of the file
the pipeline already writes for other transforms.

Reads: data/raw/<SEASON>/league_base_<date>.json  (the newest one)
Writes: app/public/hawksData-<SEASON>.json  (adds `td3_total` per player)

Must run AFTER transform.py (which creates hawksData and the player list);
otherwise there's no player object to attach `td3_total` to.
"""

import json
import glob
from pathlib import Path

from pipeline.config import SEASON, RAW_DATA_DIR, HAWKS_DATA_FILENAME


def _latest_league_base(raw_dir):
    """Newest league_base_*.json path, or None."""
    files = sorted(Path(raw_dir).glob("league_base_*.json"))
    return files[-1] if files else None


def _td3_by_player_id(league_base_path):
    """Return {player_id: td3_count} for every player in the league file."""
    with open(league_base_path) as f:
        data = json.load(f)
    for rs in data.get("resultSets", []):
        if rs.get("name") == "LeagueDashPlayerStats":
            headers = rs.get("headers", [])
            if "TD3" not in headers or "PLAYER_ID" not in headers:
                return {}
            td3_idx = headers.index("TD3")
            pid_idx = headers.index("PLAYER_ID")
            return {row[pid_idx]: (row[td3_idx] or 0) for row in rs.get("rowSet", [])}
    return {}


def run():
    raw_dir = Path(RAW_DATA_DIR) / SEASON
    src = _latest_league_base(raw_dir)
    if src is None:
        print(f"[transform-triple-doubles] no league_base file in {raw_dir}; skipping")
        return

    td3_lookup = _td3_by_player_id(src)
    if not td3_lookup:
        print(f"[transform-triple-doubles] no TD3 column in {src}; skipping")
        return

    data_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(data_path) as f:
        hawks = json.load(f)

    enriched = 0
    for player in hawks.get("players", []):
        pid = player.get("id")
        if pid in td3_lookup:
            player["td3_total"] = td3_lookup[pid]
            enriched += 1

    with open(data_path, "w") as f:
        json.dump(hawks, f, indent=2)

    print(f"[transform-triple-doubles] enriched {enriched} players (from {src.name})")


if __name__ == "__main__":
    run()
