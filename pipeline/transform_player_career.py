"""
Transform per-player career-stat raw files into career totals + personal
bests, merged onto each player in hawksData-<SEASON>.json under the key
`career`. Used by B3 (milestone tracker) on the Insights tab.

Reads the newest `career_<player_id>_<date>.json` for each Hawks player
from data/raw/<SEASON>/ (written by fetch_player_career.py).

Shape merged into each player object:
    career: {
        totals: { pts, reb, ast, stl, blk, fg3m, fgm, fga, ftm, fta, tov,
                  fg3a, gp, min },
            # LIFETIME totals across every franchise the player has
            # played for. Used for round-number milestones (10k career PTS)
            # and the personal-best comparison below.
        hawks_totals: { pts, reb, ast, stl, blk, fg3m, fgm, fga, ftm, fta,
                        tov, fg3a, gp, min },
            # HAWKS-ONLY totals, aggregated from SeasonTotalsRegularSeason
            # rows where TEAM_ABBREVIATION == 'ATL'. Used for franchise
            # all-time rank comparisons — the right denominator for "is
            # <player> top-10 Hawks all-time in <stat>".
        best_season: {
            pts: { value, season },     # e.g. 2135, "2022-23"
            ...
        },
        seasons_played: int,            # distinct SEASON_IDs in regular season
    }

Nov 21: added hawks_totals for franchise all-time rank comparisons.
"""

import json
from pathlib import Path

from pipeline.config import (
    SEASON,
    RAW_DATA_DIR,
    HAWKS_DATA_FILENAME,
)

# NBA.com column names in SeasonTotalsRegularSeason (positional index in rowSet)
# All of these also appear in CareerTotalsRegularSeason with the same name.
STAT_COLS = {
    "pts":  "PTS",
    "reb":  "REB",
    "ast":  "AST",
    "stl":  "STL",
    "blk":  "BLK",
    "fg3m": "FG3M",
    "fg3a": "FG3A",
    "fgm":  "FGM",
    "fga":  "FGA",
    "ftm":  "FTM",
    "fta":  "FTA",
    "tov":  "TOV",
    "gp":   "GP",
    "min":  "MIN",
}

# Which stats get a "best single-season" entry. gp / min / fga / fg3a / fta
# are context, not milestone-worthy on their own; tov best season is a dubious
# honor; rate-stat milestones are computed elsewhere from leaderboard data.
BEST_SEASON_STATS = ("pts", "reb", "ast", "stl", "blk", "fg3m", "fgm", "ftm")


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


def _aggregate(rows, headers, row_filter=None):
    """Sum each stat column across rows. row_filter(row) must return True to
    include the row. Returns a dict shaped like STAT_COLS keys → number.
    None values in a row are treated as 0."""
    out = {}
    for key, col in STAT_COLS.items():
        if col not in headers:
            continue
        idx = headers.index(col)
        total = 0
        for row in rows:
            if row_filter is not None and not row_filter(row):
                continue
            v = row[idx]
            if v is not None:
                total += v
        out[key] = total
    return out


def _career_block(data):
    """Build the career{} block for one player from its raw file."""
    season_headers, season_rows = _parse_result_set(data, "SeasonTotalsRegularSeason")
    career_headers, career_rows = _parse_result_set(data, "CareerTotalsRegularSeason")

    if season_headers is None or career_headers is None:
        return None

    # --- totals (lifetime) ---
    # Prefer NBA.com's own career-totals row rather than summing ourselves —
    # it handles traded-mid-season rows correctly (the per-season rowSet
    # includes BOTH a per-team row AND a "TOT" row for the same season).
    totals = {}
    if career_rows:
        row = career_rows[0]
        for key, col in STAT_COLS.items():
            if col in career_headers:
                totals[key] = row[career_headers.index(col)]

    # --- hawks_totals (franchise-only) ---
    # Aggregate SeasonTotalsRegularSeason rows where TEAM_ABBREVIATION == 'ATL'.
    # Important: NBA.com's SeasonTotals rows for a traded season include
    # per-team rows AND a "TOT" row with TEAM_ABBREVIATION='TOT'. We want the
    # ATL per-team row only — filtering by 'ATL' naturally excludes 'TOT'.
    hawks_totals = {}
    if season_rows and "TEAM_ABBREVIATION" in season_headers:
        team_idx = season_headers.index("TEAM_ABBREVIATION")
        hawks_totals = _aggregate(
            season_rows,
            season_headers,
            row_filter=lambda r: r[team_idx] == "ATL",
        )

    # --- best single-season for each stat (lifetime, any team) ---
    best = {}
    if season_rows:
        season_idx = season_headers.index("SEASON_ID") if "SEASON_ID" in season_headers else None
        team_idx = season_headers.index("TEAM_ABBREVIATION") if "TEAM_ABBREVIATION" in season_headers else None
        for key in BEST_SEASON_STATS:
            col = STAT_COLS[key]
            if col not in season_headers:
                continue
            col_idx = season_headers.index(col)
            best_value = None
            best_season = None
            for row in season_rows:
                # Skip the per-team rows of a traded season — the 'TOT' row
                # holds the season total and is what best_season should use.
                # A season where the player stayed on one team only has that
                # one row (no 'TOT' row), so this still catches it.
                if team_idx is not None and row[team_idx] != "TOT":
                    # Check if the player was traded this season by looking for
                    # another row with the same SEASON_ID. If so, skip this
                    # non-TOT row.
                    sid = row[season_idx] if season_idx is not None else None
                    if sid is not None:
                        multi = sum(
                            1 for r in season_rows
                            if r[season_idx] == sid and r[team_idx] != "TOT"
                        )
                        if multi > 1:
                            continue  # this is a per-team split row; prefer TOT
                v = row[col_idx]
                if v is None:
                    continue
                if best_value is None or v > best_value:
                    best_value = v
                    best_season = row[season_idx] if season_idx is not None else None
            best[key] = {"value": best_value, "season": best_season}

    # --- distinct regular-season seasons played ---
    # Count distinct SEASON_ID, ignoring per-team split rows so a traded
    # season still counts once.
    seasons = set()
    if season_rows and "SEASON_ID" in season_headers:
        idx = season_headers.index("SEASON_ID")
        for row in season_rows:
            if row[idx]:
                seasons.add(row[idx])

    return {
        "totals": totals,
        "hawks_totals": hawks_totals,
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
