"""
Aggregate Hawks players' shots into named zones and merge into hawksData.json.

Reads: data/shots/<player_id>.json (one file per Hawks player, written by
       transform_shots.py — array of {x, y, made, type, dist, zone})
Reads+writes: app/public/hawksData.json (adds player.zones to each player)

Must run AFTER transform.py (which writes hawksData.json) and after
transform_shots.py (which writes the per-player shot files).

Stores 7 zone keys: 5 "display" zones used by the profile chips, plus
l_corner_3 / r_corner_3 split-out variants reserved for the league
leaderboards (where left-vs-right asymmetry becomes a sortable stat).
"""

import json
from collections import defaultdict
from pathlib import Path

from pipeline.config import HAWKS_DATA_FILENAME
HAWKS_DATA = Path("app/public") / HAWKS_DATA_FILENAME
SHOTS_DIR = Path("data/shots")

# Map NBA.com's SHOT_ZONE_BASIC values → our internal bucket name.
# Note: Left/Right Corner 3 map to their own buckets here; we SYNTHESIZE
# the combined "corner_3" bucket after aggregation.
ZONE_MAP = {
    "Restricted Area":         "at_rim",
    "In The Paint (Non-RA)":   "paint",
    "Mid-Range":               "mid",
    "Left Corner 3":           "l_corner_3",
    "Right Corner 3":          "r_corner_3",
    "Above the Break 3":       "above_break_3",
    # "Backcourt" shots (half-court heaves) intentionally skipped
}

# Every zone key we expect in the final output (both profile + leaderboard use)
OUTPUT_KEYS = [
    "at_rim", "paint", "mid",
    "corner_3",          # synthesized: l_corner_3 + r_corner_3
    "l_corner_3", "r_corner_3",
    "above_break_3",
]


def compute_zones_for_player(player_id: int) -> dict | None:
    """Read one player's shot file, return {zone_key: {fga, fgm, pct}} or None."""
    shot_file = SHOTS_DIR / f"{player_id}.json"
    if not shot_file.exists():
        return None

    shots = json.loads(shot_file.read_text())

    totals = defaultdict(lambda: {"fga": 0, "fgm": 0})
    for shot in shots:
        bucket = ZONE_MAP.get(shot.get("zone"))
        if bucket is None:
            continue
        totals[bucket]["fga"] += 1
        totals[bucket]["fgm"] += shot.get("made", 0)

    # Synthesize combined corner_3 from left + right
    totals["corner_3"]["fga"] = totals["l_corner_3"]["fga"] + totals["r_corner_3"]["fga"]
    totals["corner_3"]["fgm"] = totals["l_corner_3"]["fgm"] + totals["r_corner_3"]["fgm"]

    # Ensure every output key is present (even if 0 attempts) so UI code
    # can render consistently rather than conditionally hiding zones.
    zones = {}
    for key in OUTPUT_KEYS:
        fga = totals[key]["fga"]
        fgm = totals[key]["fgm"]
        zones[key] = {
            "fga": fga,
            "fgm": fgm,
            "pct": round(fgm / fga, 4) if fga > 0 else None,
        }
    return zones


def run():
    data = json.loads(HAWKS_DATA.read_text())
    players = data.get("players", [])

    updated = 0
    skipped = 0
    for player in players:
        zones = compute_zones_for_player(player["id"])
        if zones is None:
            skipped += 1
            continue
        player["zones"] = zones
        updated += 1

    HAWKS_DATA.write_text(json.dumps(data, indent=2))
    print(f"[shot-zones] updated {updated} players ({skipped} skipped — no shot file)")


if __name__ == "__main__":
    run()