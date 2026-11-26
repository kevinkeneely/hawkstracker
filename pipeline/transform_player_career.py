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
        seasons: [                      # per-season breakdowns for the
            {                           # Career Comparison view (Nov 26)
                season: "2022-23",
                team: "NOP",            # "NOP/ATL" for mid-season trades
                age: 20,
                gp: 59, min: 17.7,      # per game
                pts: 3.9, reb: 3.1, oreb: 1.0, dreb: 2.1,
                ast: 1.5, stl: 1.2, blk: 0.3, tov: 0.9,
                fg_pct: 0.418, fg3_pct: 0.314, ft_pct: 0.750,
                ts_pct: 0.478, efg_pct: 0.433,
            },
            ...  # one per season, chronological (oldest → newest)
        ],
    }

Nov 21: added hawks_totals for franchise all-time rank comparisons.
Nov 26: added per-season `seasons` array for the Career Comparison view.
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


def _season_breakdowns(data):
    """Build a list of per-season rows for the Career Comparison view.

    Each element carries per-game Traditional stats plus derived shooting
    splits (TS%, eFG%). Mid-season trades: NBA.com's rowSet includes BOTH
    per-team rows AND a 'TOT' aggregate row for the same SEASON_ID. We use
    the TOT row for stats (it already has the season totals pre-summed)
    and construct a team display string from the per-team rows, e.g.
    "NOP/ATL". Single-team seasons have just one row and no TOT.
    """
    headers, rows = _parse_result_set(data, "SeasonTotalsRegularSeason")
    if not headers or not rows:
        return []

    # Resolve column indices once. Guard against any column not being
    # present in the response (NBA.com has changed schemas before).
    need = [
        "SEASON_ID", "TEAM_ABBREVIATION", "PLAYER_AGE",
        "GP", "MIN", "PTS", "REB", "OREB", "DREB",
        "AST", "STL", "BLK", "TOV",
        "FGM", "FGA", "FG_PCT",
        "FG3M", "FG3A", "FG3_PCT",
        "FTM", "FTA", "FT_PCT",
    ]
    idx = {name: headers.index(name) for name in need if name in headers}

    # Group rows by SEASON_ID so we can detect mid-season trades.
    by_season = {}
    for row in rows:
        sid = row[idx["SEASON_ID"]]
        if sid:
            by_season.setdefault(sid, []).append(row)

    def _get(row, name, default=0):
        if name not in idx:
            return default
        v = row[idx[name]]
        return v if v is not None else default

    out = []
    for sid in sorted(by_season.keys()):  # chronological (oldest → newest)
        season_rows = by_season[sid]

        # Mid-season trade: prefer TOT row for stats; construct team display
        # from the per-team rows in the order they appear.
        tot_row = next(
            (r for r in season_rows if r[idx["TEAM_ABBREVIATION"]] == "TOT"),
            None,
        )
        if tot_row is not None:
            stat_row = tot_row
            team_display = "/".join(
                r[idx["TEAM_ABBREVIATION"]]
                for r in season_rows
                if r[idx["TEAM_ABBREVIATION"]] != "TOT"
            )
        else:
            stat_row = season_rows[0]
            team_display = stat_row[idx["TEAM_ABBREVIATION"]]

        gp = _get(stat_row, "GP")
        if not gp:
            continue  # no games played; skip

        # Counting stats are season totals; divide by GP for per-game.
        pts  = _get(stat_row, "PTS")
        reb  = _get(stat_row, "REB")
        oreb = _get(stat_row, "OREB")
        dreb = _get(stat_row, "DREB")
        ast  = _get(stat_row, "AST")
        stl  = _get(stat_row, "STL")
        blk  = _get(stat_row, "BLK")
        tov  = _get(stat_row, "TOV")
        fgm  = _get(stat_row, "FGM")
        fga  = _get(stat_row, "FGA")
        fg3m = _get(stat_row, "FG3M")
        fta  = _get(stat_row, "FTA")
        minutes = _get(stat_row, "MIN")

        # Derived shooting splits — standard formulas.
        # TS% = PTS / (2 * (FGA + 0.44 * FTA))
        # eFG% = (FGM + 0.5 * FG3M) / FGA
        ts_denom = 2 * (fga + 0.44 * fta)
        ts_pct = (pts / ts_denom) if ts_denom > 0 else None
        efg_pct = ((fgm + 0.5 * fg3m) / fga) if fga > 0 else None

        age = _get(stat_row, "PLAYER_AGE", default=None)
        age_display = int(age) if age is not None else None

        out.append({
            "season":   sid,
            "team":     team_display,
            "age":      age_display,
            "gp":       gp,
            "min":      round(minutes / gp, 1) if gp else None,
            "pts":      round(pts / gp, 1),
            "reb":      round(reb / gp, 1),
            "oreb":     round(oreb / gp, 1),
            "dreb":     round(dreb / gp, 1),
            "ast":      round(ast / gp, 1),
            "stl":      round(stl / gp, 1),
            "blk":      round(blk / gp, 1),
            "tov":      round(tov / gp, 1),
            "fg_pct":   _get(stat_row, "FG_PCT", default=None),
            "fg3_pct":  _get(stat_row, "FG3_PCT", default=None),
            "ft_pct":   _get(stat_row, "FT_PCT",  default=None),
            "ts_pct":   round(ts_pct, 3) if ts_pct is not None else None,
            "efg_pct":  round(efg_pct, 3) if efg_pct is not None else None,
        })

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
        "seasons": _season_breakdowns(data),
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
