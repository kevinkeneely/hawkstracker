"""
Enrich each Hawks player in hawksData.json with their shooting tracking
stats (Catch & Shoot, Pull-Up, Contested, Uncontested) + league percentile
ranks.

Reads: app/public/league_shooting_tracking-<SEASON>.json
Reads+writes: app/public/hawksData-<SEASON>.json

For each Hawks player, adds a nested block mirroring the league file's
shape — four shot-type sub-blocks, each with 7 fields:

  player["shooting_tracking"] = {
    "cs":          {
      "fgm":     {"value": ..., "pctile": ...},
      "fga":     {...}, "fg_pct":  {...}, "efg_pct": {...},
      "fg3m":    {...}, "fg3a":    {...}, "fg3_pct": {...}
    },
    "pullup":       { ... same shape ... },
    "contested":    { ... },
    "uncontested":  { ... }
  }

Must run AFTER transform_tracking_shooting.py (writes the league file we
read) and after transform.py (writes the hawksData file we enrich).
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA  = Path("app/public") / HAWKS_DATA_FILENAME
LEAGUE_FILE = Path("app/public") / f"league_shooting_tracking-{SEASON}.json"

MIN_GP = 5

SUB_BLOCKS = ["cs", "pullup", "contested", "uncontested"]
FIELDS     = ["fgm", "fga", "fg_pct", "efg_pct", "fg3m", "fg3a", "fg3_pct"]


def compute_percentile(value, pool: list) -> float | None:
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return round(below / len(valid), 4)


def run():
    if not LEAGUE_FILE.exists():
        raise FileNotFoundError(
            f"{LEAGUE_FILE} missing — run transform_tracking_shooting.py first"
        )

    league = json.loads(LEAGUE_FILE.read_text())
    all_players = league.get("players", [])

    pool = [p for p in all_players if (p.get("gp") or 0) >= MIN_GP]
    print(f"[hawks-shooting-tracking] percentile pool: {len(pool)} players with GP >= {MIN_GP}")

    # Pre-build pool value lists for every (sub_block, field) pair
    pool_by_field = {}
    for sub_block in SUB_BLOCKS:
        pool_by_field[sub_block] = {
            field: [p.get(sub_block, {}).get(field) for p in pool]
            for field in FIELDS
        }

    by_pid = {p["id"]: p for p in all_players}

    hawks = json.loads(HAWKS_DATA.read_text())
    players = hawks.get("players", [])

    updated = 0
    missing = 0
    for player in players:
        league_player = by_pid.get(player["id"])
        if league_player is None:
            missing += 1
            continue
        block = {}
        for sub_block in SUB_BLOCKS:
            source = league_player.get(sub_block, {})
            block[sub_block] = {}
            for field in FIELDS:
                value = source.get(field)
                pctile = compute_percentile(value, pool_by_field[sub_block][field])
                block[sub_block][field] = {"value": value, "pctile": pctile}
        player["shooting_tracking"] = block
        updated += 1

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    print(f"[hawks-shooting-tracking] updated {updated} Hawks players ({missing} missing from league file)")


if __name__ == "__main__":
    run()
