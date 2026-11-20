"""
Transform per-player career-stat raw files into career totals + personal
bests, merged onto each player in hawksData-<SEASON>.json under the key
`career`. Used by B3 (milestone tracker) on the Insights tab.

Reads the newest `career_<player_id>_<date>.json` for each Hawks player
from data/raw/<SEASON>/ (written by fetch_player_career.py).

Shape merged into each player object:
    career: {
        totals: { pts, reb, ast, stl, blk, fg3m, tov, gp, min },
        best_season: {
            pts: { value, season },     # e.g. 2135, "2022-23"
            reb: { value, season },
            ast: { value, season },
            stl: { value, season },
            blk: { value, season },
            fg3m: { value, season },
        },
        seasons_played: int,            # distinct SEASON_IDs in regular season
    }
"""

import json
from pathlib import Path

from pipeline.config import (
    SEASON,
    RAW_DATA_DIR,
    HAWKS_DATA_FILENAME,
)

# NBA.com column names in SeasonTotalsRegularSeason (positional index in rowSet)
STAT_COLS = {
    "pts": "PTS",
    "reb": "REB",
    "ast": "AST",
    "stl": "STL",
    "blk": "BLK",
    "fg3m": "FG3M",
    "tov": "TOV",
    "gp":  "GP",
    "min": "MIN",
}


def _latest_career_file(raw_dir, player_id):
    """Return the newest career_<pid>_<date>.json path for a player, or None."""
    candidates = sorted(raw_dir.glob(f"career_{player_id}_*.json"))
    return candidates[-1] if candidates else None


def _parse_result_set(data, name):
    """Find a named resultSet and return (headers, rows) or (None, [])."""
    for rs in data.get("resultSets", []):
        if rs.get("name") == name:
            return rs.get("headers", []), rs.get("rowSet", [])
    return None, []


def _career_block(data):
    """Build the career{} block for one player from its raw file."""
    # Per-season rows (one per season the player played in the regular season)
    season_headers, season_rows = _parse_result_set(data, "SeasonTotalsRegularSeason")
    # Lifetime totals (a single row)
    career_headers, career_rows = _parse_result_set(data, "CareerTotalsRegularSeason")

    if season_headers is None or career_headers is None:
        return None

    # --- totals (lifetime) ---
    totals = {}
    if career_rows:
        row = career_rows[0]
        for key, col in STAT_COLS.items():
            if col in career_headers:
                totals[key] = row[career_headers.index(col)]

    # --- best single-season for each stat ---
    best = {}
    if season_rows:
        season_idx = season_headers.index("SEASON_ID") if "SEASON_ID" in season_headers else None
        for key, col in STAT_COLS.items():
            if key in ("gp", "min", "tov") or col not in season_headers:
                continue
            col_idx = season_headers.index(col)
            best_value = None
            best_season = None
            for row in season_rows:
                v = row[col_idx]
                if v is None:
                    continue
                if best_value is None or v > best_value:
                    best_value = v
                    best_season = row[season_idx] if season_idx is not None else None
            best[key] = {"value": best_value, "season": best_season}

    # --- distinct regular-season seasons played ---
    seasons = set()
    if season_rows and "SEASON_ID" in season_headers:
        idx = season_headers.index("SEASON_ID")
        for row in season_rows:
            if row[idx]:
                seasons.add(row[idx])

    return {
        "totals": totals,
        "best_season": best,
        "seasons_played": len(seasons),
    }


def run():
    # NOTE: no season-match check — PlayerCareerStats spans all seasons.
    raw_dir = Path(RAW_DATA_DIR) / SEASON
    data_path = Path("app/public") / HAWKS_DATA_FILENAME

    with open(data_path) as f:
        hawks = json.load(f)

    enriched = 0
    missing = 0
    for player in hawks.get("players", []):
        pid = player["id"]
        src = _latest_career_file(raw_dir, pid)
        if src is None:
            missing += 1
            continue

        with open(src) as f:
            raw = json.load(f)

        block = _career_block(raw)
        if block is None:
            missing += 1
            continue

        player["career"] = block
        enriched += 1

    with open(data_path, "w") as f:
        json.dump(hawks, f, indent=2)

    print(f"[transform-player-career] enriched {enriched} players, missing {missing}")


if __name__ == "__main__":
    run()
