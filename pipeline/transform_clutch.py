"""
Compute Hawks players' clutch stats + percentiles vs the full league.

NBA.com's "Advanced" clutch measure includes every Base clutch field
PLUS the advanced ratings/percentages, so we only need to read the
Advanced raw file to cover all 33 picks.

Reads: data/raw/<SEASON>/league_clutch_adv_<date>.json (latest)
Reads+writes: app/public/hawksData.json (adds player.clutch nested object)

NBA's clutch definition: last 5 minutes of game, score margin ≤ 5.

Must run AFTER transform.py (writes hawksData.json) and
fetch_league_clutch.py.
"""

import json
from pathlib import Path

from pipeline.config import SEASON

HAWKS_DATA = Path("app/public/hawksData.json")
RAW_DIR = Path("data/raw") / SEASON

MIN_CLUTCH_GP = 3  # Needs some clutch time to be a meaningful comparison

# 33 clutch fields we track, mapped from NBA.com column → our JSON key
CLUTCH_FIELDS = {
    # Base-measure fields (volume, counting, basic shooting)
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
    # Advanced-measure fields (ratings, efficiency, impact)
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


def load_rows() -> list[dict]:
    """Load latest league_clutch_adv_*.json, return rows as dicts."""
    f = latest_file("league_clutch_adv_*.json")
    if f is None:
        raise FileNotFoundError(
            "No league_clutch_adv_*.json in data/raw — run fetch_league_clutch.py first"
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
    rows = load_rows()
    print(f"[clutch] loaded {len(rows)} players from latest league clutch (advanced) file")

    # Qualifying pool: players with real clutch time, not noise samples
    pool_rows = [r for r in rows if (r.get("GP") or 0) >= MIN_CLUTCH_GP]
    print(f"[clutch] percentile pool: {len(pool_rows)} players with GP >= {MIN_CLUTCH_GP}")

    # Pre-extract each stat's full pool once
    pool_by_stat = {
        nba_key: [r.get(nba_key) for r in pool_rows]
        for nba_key in CLUTCH_FIELDS
    }

    # Index all rows by PLAYER_ID for O(1) Hawks lookup
    by_pid = {r["PLAYER_ID"]: r for r in rows}

    # Load hawksData.json, add clutch to each Hawks player
    hawks = json.loads(HAWKS_DATA.read_text())
    players = hawks.get("players", [])

    updated = 0
    missing = 0
    for player in players:
        row = by_pid.get(player["id"])
        if row is None:
            missing += 1
            continue
        clutch = {}
        for nba_key, our_key in CLUTCH_FIELDS.items():
            value = row.get(nba_key)
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