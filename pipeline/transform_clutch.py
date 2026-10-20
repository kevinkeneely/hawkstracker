"""
Compute Hawks players' clutch stats + percentiles vs the full league.

NBA.com's Advanced clutch measure covers ratings, efficiency and
percentage-based impact stats. The Base measure covers counting stats
(PTS, REB, AST, STL, BLK, TOV, 3PM/A/%, FTM/A/%, PF, +/−). We load
BOTH raw files and pull each field from the right source.

Reads: data/raw/<SEASON>/league_clutch_<date>.json       (base measure)
       data/raw/<SEASON>/league_clutch_adv_<date>.json   (advanced measure)
Reads+writes: app/public/hawksData.json (adds player.clutch nested object)

NBA's clutch definition: last 5 minutes of game, score margin ≤ 5.

Must run AFTER transform.py (writes hawksData.json) and
fetch_league_clutch.py.
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA = Path("app/public") / HAWKS_DATA_FILENAME
RAW_DIR = Path("data/raw") / SEASON

MIN_CLUTCH_GP = 3  # Needs some clutch time to be a meaningful comparison

# Fields from the Base measure (counting stats, basic shooting, context)
BASE_FIELDS = {
    "GP":         "gp",
    "MIN":        "min",
    "PTS":        "pts",
    "OREB":       "oreb",
    "DREB":       "dreb",
    "REB":        "reb",
    "AST":        "ast",
    "STL":        "stl",
    "BLK":        "blk",
    "TOV":        "tov",
    "FGM":        "fgm",
    "FGA":        "fga",
    "FG_PCT":     "fg_pct",
    "FG3M":       "fg3m",
    "FG3A":       "fg3a",
    "FG3_PCT":    "fg3_pct",
    "FTM":        "ftm",
    "FTA":        "fta",
    "FT_PCT":     "ft_pct",
    "PF":         "pf",
    "PLUS_MINUS": "plus_minus",
}

# Fields from the Advanced measure (ratings, efficiency, impact)
ADV_FIELDS = {
    "OFF_RATING": "off_rating",
    "DEF_RATING": "def_rating",
    "NET_RATING": "net_rating",
    "EFG_PCT":    "efg_pct",
    "TS_PCT":     "ts_pct",
    "AST_PCT":    "ast_pct",
    "OREB_PCT":   "oreb_pct",
    "DREB_PCT":   "dreb_pct",
    "REB_PCT":    "reb_pct",
    "TM_TOV_PCT": "tm_tov_pct",
    "USG_PCT":    "usg_pct",
    "PIE":        "pie",
}


def latest_file(pattern: str) -> Path | None:
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def load_rows(pattern: str) -> list[dict]:
    """Load latest raw clutch file matching pattern, return rows as dicts."""
    f = latest_file(pattern)
    if f is None:
        raise FileNotFoundError(
            f"No {pattern} in data/raw — run fetch_league_clutch.py first"
        )
    data = json.loads(f.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    return [dict(zip(headers, row)) for row in rs["rowSet"]]


def compute_percentile(value, pool: list) -> float | None:
    """Fraction of pool strictly below value. Returns None if either is missing."""
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return round(below / len(valid), 4)


def run():
    # Base file matches league_clutch_<date>.json but NOT league_clutch_adv_<date>.json.
    # The adv glob is more specific, so we filter base manually to avoid overlap.
    base_rows = [
        r for r in load_rows("league_clutch_*.json")
    ]
    # Re-glob narrowly: pick latest base-only file (filename does NOT contain "_adv_")
    base_file = sorted(
        f for f in RAW_DIR.glob("league_clutch_*.json")
        if "_adv_" not in f.name
    )[-1]
    base_data = json.loads(base_file.read_text())
    base_rs = base_data["resultSets"][0]
    base_rows = [dict(zip(base_rs["headers"], row)) for row in base_rs["rowSet"]]

    adv_rows = load_rows("league_clutch_adv_*.json")
    print(f"[clutch] loaded base={len(base_rows)} players, advanced={len(adv_rows)} players")

    # Qualifying pools: each file gates on its own GP column
    base_pool = [r for r in base_rows if (r.get("GP") or 0) >= MIN_CLUTCH_GP]
    adv_pool = [r for r in adv_rows if (r.get("GP") or 0) >= MIN_CLUTCH_GP]
    print(f"[clutch] percentile pools: base={len(base_pool)}, advanced={len(adv_pool)}")

    # Pre-extract per-stat pools from the right source
    pool_by_stat = {}
    for nba_key in BASE_FIELDS:
        pool_by_stat[nba_key] = [r.get(nba_key) for r in base_pool]
    for nba_key in ADV_FIELDS:
        pool_by_stat[nba_key] = [r.get(nba_key) for r in adv_pool]

    # Index both files by PLAYER_ID for O(1) lookup
    base_by_pid = {r["PLAYER_ID"]: r for r in base_rows}
    adv_by_pid = {r["PLAYER_ID"]: r for r in adv_rows}

    # Load hawksData.json, add clutch to each Hawks player
    hawks = json.loads(HAWKS_DATA.read_text())
    players = hawks.get("players", [])

    updated = 0
    missing = 0
    for player in players:
        base_row = base_by_pid.get(player["id"])
        adv_row = adv_by_pid.get(player["id"])
        if base_row is None and adv_row is None:
            missing += 1
            continue
        clutch = {}
        for nba_key, our_key in BASE_FIELDS.items():
            value = base_row.get(nba_key) if base_row else None
            pctile = compute_percentile(value, pool_by_stat[nba_key])
            clutch[our_key] = {"value": value, "pctile": pctile}
        for nba_key, our_key in ADV_FIELDS.items():
            value = adv_row.get(nba_key) if adv_row else None
            pctile = compute_percentile(value, pool_by_stat[nba_key])
            clutch[our_key] = {"value": value, "pctile": pctile}
        player["clutch"] = clutch
        updated += 1

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    print(
        f"[clutch] updated {updated} Hawks players "
        f"({missing} missing — no clutch time this season)"
    )


if __name__ == "__main__":
    run()