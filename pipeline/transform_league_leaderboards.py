"""
Compute league-wide shooting leaderboards per zone.

Reads:
  - data/raw/<SEASON>/base_<date>.json  (leaguedashplayerstats, latest file)
  - data/raw/<SEASON>/league_shots/shots_<pid>_<date>.json  (all league players)
Writes:
  - app/public/league_leaderboards.json

Includes every player meeting MIN_GP; frontend applies per-zone FGA filters
when rendering each leaderboard.

Must run AFTER fetch.py (base stats) and fetch_league_shots.py (shot files).
"""

import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
SHOTS_DIR = RAW_DIR / "league_shots"
from pipeline.config import LEADERBOARDS_FILENAME
OUT_PATH = Path("app/public") / LEADERBOARDS_FILENAME

MIN_GP = 5  # Lowered for early 2026-27 season; bump back to 20 after ~Nov 15

ZONE_MAP = {
    "Restricted Area":         "at_rim",
    "In The Paint (Non-RA)":   "paint",
    "Mid-Range":               "mid",
    "Left Corner 3":           "l_corner_3",
    "Right Corner 3":          "r_corner_3",
    "Above the Break 3":       "above_break_3",
}

OUTPUT_KEYS = [
    "at_rim", "paint", "mid",
    "corner_3",
    "l_corner_3", "r_corner_3",
    "above_break_3",
]

# Minimum FGA per zone to appear on that zone's leaderboard (frontend filter)
# Lowered for early 2026-27 season; restore to full-season floors (~Nov 15):
#   at_rim 50, paint 25, mid 20, corner_3 20, l_corner_3 10, r_corner_3 10, above_break_3 50
MIN_FGA = {
    "at_rim": 15,
    "paint": 10,
    "mid": 10,
    "corner_3": 8,
    "l_corner_3": 5,
    "r_corner_3": 5,
    "above_break_3": 15,
}


def latest_file(pattern: str) -> Path | None:
    """Most recent file matching the glob pattern in RAW_DIR, or None."""
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def latest_shot_file_per_player() -> dict[int, Path]:
    """One file per player per day accumulates — keep the most recent per player."""
    by_player = {}
    for path in SHOTS_DIR.glob("shots_*.json"):
        parts = path.stem.split("_")  # shots_<pid>_<YYYY-MM-DD>
        if len(parts) != 3:
            continue
        _, pid_str, date_str = parts
        try:
            pid = int(pid_str)
        except ValueError:
            continue
        existing = by_player.get(pid)
        if existing is None or date_str > existing.stem.split("_")[2]:
            by_player[pid] = path
    return by_player


def load_player_bios() -> dict[int, dict]:
    """From the latest base_<date>.json, build {player_id: {name, team, gp}}."""
    base_file = latest_file("league_base_*.json")
    if base_file is None:
         raise FileNotFoundError("No league_base_*.json in data/raw — run fetch.py first")

    data = json.loads(base_file.read_text())
    # Raw NBA.com shape: resultSets is a list; each has name, headers, rowSet (list of lists)
    rs = next(r for r in data["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    headers = rs["headers"]
    rows = rs["rowSet"]

    # Look up column indices once (headers are a flat list, rows are parallel lists)
    pid_idx = headers.index("PLAYER_ID")
    name_idx = headers.index("PLAYER_NAME")
    team_idx = headers.index("TEAM_ABBREVIATION")
    gp_idx = headers.index("GP")

    bios = {}
    for row in rows:
        bios[row[pid_idx]] = {
            "name": row[name_idx],
            "team": row[team_idx],
            "gp": row[gp_idx],
        }
    return bios


def compute_zones(shot_file: Path) -> dict:
    """Aggregate one player's shots into zone totals (reads raw NBA.com field names)."""
    data = json.loads(shot_file.read_text())
    shots = data.get("Shot_Chart_Detail", [])

    totals = defaultdict(lambda: {"fga": 0, "fgm": 0})
    for s in shots:
        bucket = ZONE_MAP.get(s.get("SHOT_ZONE_BASIC"))
        if bucket is None:
            continue
        totals[bucket]["fga"] += 1
        totals[bucket]["fgm"] += s.get("SHOT_MADE_FLAG", 0)

    # Synthesize combined corner_3 from left + right
    totals["corner_3"]["fga"] = totals["l_corner_3"]["fga"] + totals["r_corner_3"]["fga"]
    totals["corner_3"]["fgm"] = totals["l_corner_3"]["fgm"] + totals["r_corner_3"]["fgm"]

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
    bios = load_player_bios()
    shot_files = latest_shot_file_per_player()
    print(f"[leaderboards] {len(bios)} players in stats, {len(shot_files)} with shot files")

    players = []
    missing_bio = 0
    below_gp = 0
    for pid, path in shot_files.items():
        bio = bios.get(pid)
        if bio is None:
            missing_bio += 1
            continue
        if bio["gp"] < MIN_GP:
            below_gp += 1
            continue
        zones = compute_zones(path)
        players.append({
            "id": pid,
            "name": bio["name"],
            "team": bio["team"],
            "gp": bio["gp"],
            "zones": zones,
        })

    # Sort alphabetically by name for stable git diffs
    players.sort(key=lambda p: p["name"])

    out = {
        "season": SEASON,
        "generated_at": datetime.now().astimezone().isoformat(),
        "min_gp": MIN_GP,
        "min_fga_per_zone": MIN_FGA,
        "players": players,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(
        f"[leaderboards] wrote {OUT_PATH} ({len(players)} qualified, "
        f"{below_gp} below {MIN_GP} GP, {missing_bio} missing bios, {size_kb:.1f} KB)"
    )


if __name__ == "__main__":
    run()