"""
Compute Hawks players' hustle stats + percentiles vs the full league.

Reads: data/raw/<SEASON>/league_hustle_<date>.json (latest)
Reads+writes: app/public/hawksData.json (adds player.hustle nested object)

Must run AFTER transform.py (writes hawksData.json) and fetch_hustle.py.
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA = Path("app/public") / HAWKS_DATA_FILENAME
RAW_DIR = Path("data/raw") / SEASON

MIN_GP = 5  # Early-season threshold; matches Leaders page floor

# 11 hustle stats we track, mapped from NBA.com column → our JSON key
HUSTLE_FIELDS = {
    "CONTESTED_SHOTS":      "contested_shots",
    "CONTESTED_SHOTS_2PT":  "contested_shots_2pt",
    "CONTESTED_SHOTS_3PT":  "contested_shots_3pt",
    "DEFLECTIONS":          "deflections",
    "CHARGES_DRAWN":        "charges_drawn",
    "SCREEN_ASSISTS":       "screen_assists",
    "SCREEN_AST_PTS":       "screen_ast_pts",
    "LOOSE_BALLS_RECOVERED": "loose_balls_recovered",
    "BOX_OUTS":             "box_outs",
    "PCT_BOX_OUTS_OFF":     "pct_box_outs_off",
    "PCT_BOX_OUTS_DEF":     "pct_box_outs_def",
}


def latest_file(pattern: str) -> Path | None:
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def load_rows() -> tuple[list[dict], list[str]]:
    """Load latest league hustle file. Return (rows as dicts, headers)."""
    hustle_file = latest_file("league_hustle_*.json")
    if hustle_file is None:
        raise FileNotFoundError("No league_hustle_*.json in data/raw — run fetch_hustle.py first")
    data = json.loads(hustle_file.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    # Convert each row (a flat list) into a dict for easy field access
    rows = [dict(zip(headers, row)) for row in rs["rowSet"]]
    return rows, headers


def compute_percentile(value, pool: list) -> float | None:
    """Fraction of pool strictly below value. Returns None if either is missing."""
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return round(below / len(valid), 4)


def run():
    rows, headers = load_rows()
    print(f"[hustle] loaded {len(rows)} players from latest league hustle file")

    # NBA endpoints use G or GP depending on which one — detect which
    gp_key = "G" if "G" in headers else "GP"

    # Qualifying league pool for percentile baseline
    pool_rows = [r for r in rows if (r.get(gp_key) or 0) >= MIN_GP]
    print(f"[hustle] percentile pool: {len(pool_rows)} players with {gp_key} >= {MIN_GP}")

    # Pre-extract each stat's full pool once (vs re-looping per Hawks player)
    pool_by_stat = {
        nba_key: [r.get(nba_key) for r in pool_rows]
        for nba_key in HUSTLE_FIELDS
    }

    # Index all rows by PLAYER_ID for O(1) Hawks lookup
    by_pid = {r["PLAYER_ID"]: r for r in rows}

    # Load hawksData.json, add hustle to each Hawks player
    hawks = json.loads(HAWKS_DATA.read_text())
    players = hawks.get("players", [])

    updated = 0
    missing = 0
    for player in players:
        row = by_pid.get(player["id"])
        if row is None:
            missing += 1
            continue
        hustle = {}
        for nba_key, our_key in HUSTLE_FIELDS.items():
            value = row.get(nba_key)
            pctile = compute_percentile(value, pool_by_stat[nba_key])
            hustle[our_key] = {"value": value, "pctile": pctile}
        player["hustle"] = hustle
        updated += 1

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    print(f"[hustle] updated {updated} Hawks players ({missing} missing from league file)")


if __name__ == "__main__":
    run()