"""
Enrich each Hawks player in hawksData.json with their playmaking tracking
stats (drives, passing, possessions) + league percentile ranks.

Reads: app/public/league_playmaking_tracking-<SEASON>.json
Reads+writes: app/public/hawksData-<SEASON>.json

For each Hawks player, adds a nested block mirroring the league file's
shape:

  player["playmaking_tracking"] = {
    "drives": {
      "drives":       {"value": <per-game drives>,  "pctile": <0..1>},
      "drive_fgm":    {...}, "drive_fga":  {...}, "drive_fg_pct": {...},
      "drive_pts":    {...}, "drive_ast":  {...}, "drive_tov":    {...}
    },
    "passing": {
      "passes_made":        {...}, "passes_received":   {...},
      "potential_ast":      {...}, "ast_points_created": {...},
      "ast_to_pass_pct":    {...}
    },
    "possessions": {
      "touches":            {...}, "front_ct_touches":  {...},
      "time_of_poss":       {...}, "avg_sec_per_touch": {...},
      "pts_per_touch":      {...}, "elbow_touches":     {...},
      "post_touches":       {...}, "paint_touches":     {...}
    }
  }

Must run AFTER transform_tracking_playmaking.py (writes the league file
we read) and after transform.py (writes the hawksData file we enrich).
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA  = Path("app/public") / HAWKS_DATA_FILENAME
LEAGUE_FILE = Path("app/public") / f"league_playmaking_tracking-{SEASON}.json"

MIN_GP = 5

# For each sub-block, which fields to pull across and percentile.
SUB_BLOCKS = {
    "drives": [
        "drives", "drive_fgm", "drive_fga", "drive_fg_pct",
        "drive_pts", "drive_ast", "drive_tov",
    ],
    "passing": [
        "passes_made", "passes_received", "potential_ast",
        "ast_points_created", "ast_to_pass_pct",
    ],
    "possessions": [
        "touches", "front_ct_touches", "time_of_poss", "avg_sec_per_touch",
        "pts_per_touch", "elbow_touches", "post_touches", "paint_touches",
    ],
}


def compute_percentile(value, pool: list) -> float | None:
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return round(below / len(valid), 4)


def run():
    if not LEAGUE_FILE.exists():
        raise FileNotFoundError(
            f"{LEAGUE_FILE} missing — run transform_tracking_playmaking.py first"
        )

    league = json.loads(LEAGUE_FILE.read_text())
    all_players = league.get("players", [])

    pool = [p for p in all_players if (p.get("gp") or 0) >= MIN_GP]
    print(f"[hawks-playmaking-tracking] percentile pool: {len(pool)} players with GP >= {MIN_GP}")

    # Pre-build per-field pool values for each sub-block
    pool_by_field = {}
    for sub_block, fields in SUB_BLOCKS.items():
        pool_by_field[sub_block] = {
            field: [p.get(sub_block, {}).get(field) for p in pool]
            for field in fields
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
        for sub_block, fields in SUB_BLOCKS.items():
            source = league_player.get(sub_block, {})
            block[sub_block] = {}
            for field in fields:
                value = source.get(field)
                pctile = compute_percentile(value, pool_by_field[sub_block][field])
                block[sub_block][field] = {"value": value, "pctile": pctile}
        player["playmaking_tracking"] = block
        updated += 1

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    print(f"[hawks-playmaking-tracking] updated {updated} Hawks players ({missing} missing from league file)")


if __name__ == "__main__":
    run()
