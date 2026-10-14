"""
Transform raw league shot files into a hex-binned league FG% baseline.

Reads: data/raw/<SEASON>/league_shots/shots_<pid>_<date>.json  (local only)
Writes: app/public/league_shot_baseline.json  (the only league file that ships)
"""

import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON / "league_shots"
OUT_PATH = Path("app/public/league_shot_baseline.json")

# Hex grid spec — MUST match the ShotChart component on the frontend
HEX_SIZE = 22        # NBA coord units (1 unit = 0.1 ft), ~2.2 ft radius
MIN_SAMPLE = 10      # drop hex cells with fewer than this many league shots


# ──────────────── hex binning math ────────────────
# Flat-top hexagons on an axial (q, r) coordinate grid.
# Reference: https://www.redblobgames.com/grids/hexagons/

def pixel_to_hex(x: float, y: float, size: float) -> tuple[int, int]:
    """Convert a shot's (x, y) in NBA coords to the (q, r) of its hex cell."""
    q_frac = (2 / 3 * x) / size
    r_frac = (-1 / 3 * x + math.sqrt(3) / 3 * y) / size
    return _cube_round(q_frac, r_frac)


def _cube_round(q_frac: float, r_frac: float) -> tuple[int, int]:
    """Round fractional axial coords to the nearest hex center."""
    x, z = q_frac, r_frac
    y = -x - z
    rx, ry, rz = round(x), round(y), round(z)
    x_diff, y_diff, z_diff = abs(rx - x), abs(ry - y), abs(rz - z)
    if x_diff > y_diff and x_diff > z_diff:
        rx = -ry - rz
    elif y_diff > z_diff:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return rx, rz


# ──────────────── file selection ────────────────

def latest_file_per_player() -> list[Path]:
    """One file per player per day accumulates — keep the most recent per player."""
    by_player: dict[str, Path] = {}
    for path in RAW_DIR.glob("shots_*.json"):
        parts = path.stem.split("_")  # shots_<player_id>_<YYYY-MM-DD>
        if len(parts) != 3:
            continue
        _, player_id, date_str = parts
        existing = by_player.get(player_id)
        if existing is None or date_str > existing.stem.split("_")[2]:
            by_player[player_id] = path
    return list(by_player.values())


# ──────────────── main ────────────────

def run():
    files = latest_file_per_player()
    print(f"[league-baseline] reading {len(files)} player shot files from {RAW_DIR}")

    cells: dict[tuple[int, int], dict[str, int]] = defaultdict(
        lambda: {"shots": 0, "makes": 0}
    )
    total_shots = 0

    for path in files:
        data = json.loads(path.read_text())
        for shot in data.get("Shot_Chart_Detail", []):
            key = pixel_to_hex(shot["LOC_X"], shot["LOC_Y"], HEX_SIZE)
            cells[key]["shots"] += 1
            cells[key]["makes"] += shot["SHOT_MADE_FLAG"]
            total_shots += 1

    print(f"[league-baseline] bucketed {total_shots:,} shots into {len(cells)} raw hex cells")

    hexes = []
    for (q, r), counts in cells.items():
        if counts["shots"] < MIN_SAMPLE:
            continue
        hexes.append({
            "q": q,
            "r": r,
            "shots": counts["shots"],
            "makes": counts["makes"],
            "fg_pct": round(counts["makes"] / counts["shots"], 4),
        })
    hexes.sort(key=lambda h: (h["r"], h["q"]))  # stable ordering for cleaner git diffs

    out = {
        "season": SEASON,
        "generated_at": date.today().isoformat(),
        "total_shots": total_shots,
        "hex_size": HEX_SIZE,
        "min_sample": MIN_SAMPLE,
        "hexes": hexes,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(
        f"[league-baseline] wrote {OUT_PATH} "
        f"({len(hexes)} hexes above min_sample={MIN_SAMPLE}, {size_kb:.1f} KB)"
    )


if __name__ == "__main__":
    run()