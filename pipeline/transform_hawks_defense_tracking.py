"""
Enrich each Hawks player in hawksData.json with their defensive tracking
stats (defensive FG% allowed) + league percentile ranks.

Reads: app/public/league_defense_tracking-<SEASON>.json
Reads+writes: app/public/hawksData-<SEASON>.json

For each Hawks player, adds a nested block:

  player["defense_tracking"] = {
    "d_fgm":          {"value": <per-game FGM allowed>, "pctile": <0..1>},
    "d_fga":          {"value": <per-game FGA defended>, "pctile": <0..1>},
    "d_fg_pct":       {"value": <opp FG% vs defender>,   "pctile": <0..1>},
    "normal_fg_pct":  {"value": <opp normal FG%>,        "pctile": <0..1>},
    "pct_plusminus":  {"value": <d_fg_pct - normal>,     "pctile": <0..1>}
  }

Percentiles are computed vs the league pool (players with G >= MIN_GP).
The frontend decides direction — e.g. a HIGH pctile on d_fg_pct means
opponents shoot BETTER against this defender (bad defense); a HIGH pctile
on pct_plusminus means opponents shoot MORE than normal (also bad). The
UI can flip the display color.

Must run AFTER transform_tracking_defense.py (writes the league file we
read) and after transform.py (writes the hawksData file we enrich).
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA   = Path("app/public") / HAWKS_DATA_FILENAME
LEAGUE_FILE  = Path("app/public") / f"league_defense_tracking-{SEASON}.json"

MIN_GP = 5  # Matches hustle percentile floor

# Fields we percentile. Each becomes a {value, pctile} entry under
# player.defense_tracking in hawksData.
FIELDS = ["d_fgm", "d_fga", "d_fg_pct", "normal_fg_pct", "pct_plusminus"]


def compute_percentile(value, pool: list) -> float | None:
    """Fraction of pool strictly below value. None if either is missing."""
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return round(below / len(valid), 4)


def run():
    if not LEAGUE_FILE.exists():
        raise FileNotFoundError(
            f"{LEAGUE_FILE} missing — run transform_tracking_defense.py first"
        )

    league = json.loads(LEAGUE_FILE.read_text())
    all_players = league.get("players", [])

    # Build percentile pool: players with enough GP to matter
    pool = [p for p in all_players if (p.get("gp") or 0) >= MIN_GP]
    print(f"[hawks-defense-tracking] percentile pool: {len(pool)} players with GP >= {MIN_GP}")

    # For each stat, pre-build the pool's value list once (vs re-looping per Hawks player)
    pool_by_field = {
        field: [p.get("defense", {}).get(field) for p in pool]
        for field in FIELDS
    }

    # Index all league players by id for O(1) Hawks lookup
    by_pid = {p["id"]: p for p in all_players}

    # Load hawksData and enrich each Hawks player
    hawks = json.loads(HAWKS_DATA.read_text())
    players = hawks.get("players", [])

    updated = 0
    missing = 0
    for player in players:
        league_player = by_pid.get(player["id"])
        if league_player is None:
            missing += 1
            continue
        defense = league_player.get("defense", {})
        block = {}
        for field in FIELDS:
            value = defense.get(field)
            pctile = compute_percentile(value, pool_by_field[field])
            block[field] = {"value": value, "pctile": pctile}
        player["defense_tracking"] = block
        updated += 1

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    print(f"[hawks-defense-tracking] updated {updated} Hawks players ({missing} missing from league file)")


if __name__ == "__main__":
    run()
