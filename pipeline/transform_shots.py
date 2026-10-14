"""Transform raw shot files into per-player app/public/shots/<id>.json files.

Pulls only the fields the UI needs (coordinates + made/missed + shot type).
Smaller payloads = faster browser load when opening a profile page.
"""

import json
from datetime import date
from pathlib import Path

from pipeline.config import SEASON, RAW_DATA_DIR

OUT_DIR_PUBLIC = Path("app/public/shots")
OUT_DIR_DATA = Path("data/shots")

# Columns we keep from NBA.com's shotchartdetail response.
# LOC_X/LOC_Y are in the standard NBA coordinate system
# (hoop at 0,0; units = 0.1 feet; court is -250..250 wide).
FIELDS = {
    "LOC_X": "x",
    "LOC_Y": "y",
    "SHOT_MADE_FLAG": "made",     # 0 or 1
    "SHOT_TYPE": "type",          # "2PT Field Goal" or "3PT Field Goal"
    "SHOT_DISTANCE": "dist",      # in feet
    "SHOT_ZONE_BASIC": "zone",    # "Restricted Area", "Mid-Range", etc.
}


def _load_hawks_player_ids():
    with open("data/hawksData.json") as f:
        return [p["id"] for p in json.load(f)["players"]]


def _transform_one(pid, today):
    """Read today's raw shot file for one player, return list of trimmed shots."""
    raw_path = Path(RAW_DATA_DIR) / SEASON / f"shots_{pid}_{today}.json"
    with open(raw_path) as f:
        raw = json.load(f)

    rs = raw["resultSets"][0]
    headers = rs["headers"]
    idx = {h: headers.index(h) for h in FIELDS.keys()}

    shots = []
    for row in rs["rowSet"]:
        shots.append({out_key: row[idx[in_key]] for in_key, out_key in FIELDS.items()})
    return shots


def run():
    today = date.today().isoformat()
    OUT_DIR_PUBLIC.mkdir(parents=True, exist_ok=True)
    OUT_DIR_DATA.mkdir(parents=True, exist_ok=True)

    player_ids = _load_hawks_player_ids()
    print(f"Transforming shots for {len(player_ids)} Hawks players")

    for pid in player_ids:
        shots = _transform_one(pid, today)
        for out_dir in (OUT_DIR_DATA, OUT_DIR_PUBLIC):
            with open(out_dir / f"{pid}.json", "w") as f:
                json.dump(shots, f)
        print(f"  wrote {len(shots)} shots for player {pid}")

    print("Done.")


if __name__ == "__main__":
    run()