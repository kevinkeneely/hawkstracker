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


# ─────────── Historical league pools (for Career Comparison percentiles) ───────────
# Built from data/raw/historical/<season>/league_base.json files written by
# pipeline/fetch_league_historical.py. One file per past season; frozen once
# written. We load them once per run() invocation and reuse across all players.
# The current season (SEASON) is NOT fetched here — the frontend pulls the
# player's existing current-season percentiles from the main hawksData record
# (Decision 2a — keeps current-season numbers consistent across the site).

HISTORICAL_POOL_DIR = Path("data/raw/historical")

# Stats that get percentile-ranked in the career view. invert=True means
# lower value is better (TOV). GP and MPG are context, not performance,
# so they don't get a percentile.
PCTILE_SPEC = {
    "pts":     False,
    "reb":     False,
    "ast":     False,
    "stl":     False,
    "blk":     False,
    "tov":     True,     # lower = better → inverted
    "fg_pct":  False,
    "fg3_pct": False,
    "ft_pct":  False,
    "ts_pct":  False,
    "efg_pct": False,
}

# Minimum TOTAL minutes to qualify for a historical season pool. 500 total
# minutes is the standard full-season floor used by NBA.com-adjacent sites.
# PlayerCareerStats returns per-game MIN, so we multiply back: gp × mpg.
HISTORICAL_MIN_TOTAL = 500


def _load_historical_pool(season):
    """Load the league pool for one past season and return a list of qualified
    players, each represented as a dict of {stat: value} for the stats in
    PCTILE_SPEC. Returns None if the season's cached file is missing — the
    caller should skip percentile computation for that season rather than
    crashing. Derived TS% and eFG% are computed here so they're apples-to-
    apples with the career data (which does the same)."""
    fp = HISTORICAL_POOL_DIR / season / "league_base.json"
    if not fp.exists():
        return None

    with open(fp) as f:
        data = json.load(f)

    rs_list = data.get("resultSets", [])
    if not rs_list:
        return None
    rs = rs_list[0]
    headers = rs.get("headers", [])
    rows = rs.get("rowSet", [])
    if not headers or not rows:
        return None

    need = ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
            "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
            "FTM", "FTA", "FT_PCT"]
    idx = {col: headers.index(col) for col in need if col in headers}

    pool = []
    for row in rows:
        gp = row[idx["GP"]] or 0
        mpg = row[idx["MIN"]] or 0
        if gp * mpg < HISTORICAL_MIN_TOTAL:
            continue

        # Per-game values straight from the response
        fga  = row[idx["FGA"]]  or 0
        fta  = row[idx["FTA"]]  or 0
        fgm  = row[idx["FGM"]]  or 0
        fg3m = row[idx["FG3M"]] or 0
        pts  = row[idx["PTS"]]  or 0

        # Derived shooting splits — same formulas as _season_breakdowns.
        ts_denom = 2 * (fga + 0.44 * fta)
        ts_pct = (pts / ts_denom) if ts_denom > 0 else None
        efg_pct = ((fgm + 0.5 * fg3m) / fga) if fga > 0 else None

        pool.append({
            "pts":     pts,
            "reb":     row[idx["REB"]] or 0,
            "ast":     row[idx["AST"]] or 0,
            "stl":     row[idx["STL"]] or 0,
            "blk":     row[idx["BLK"]] or 0,
            "tov":     row[idx["TOV"]] or 0,
            "fg_pct":  row[idx["FG_PCT"]],
            "fg3_pct": row[idx["FG3_PCT"]],
            "ft_pct":  row[idx["FT_PCT"]],
            "ts_pct":  ts_pct,
            "efg_pct": efg_pct,
        })
    return pool


def _percentile(value, pool_values, invert=False):
    """Standard percentile rank — share of pool strictly below (or above, if
    inverted) the given value, as a 0-1 decimal. The 0-1 scale matches the
    convention used by the rest of hawksData.json for existing _pctile fields
    (frontend expects to multiply by 100 for display). Returns None when
    value is None or the pool is empty."""
    if value is None or not pool_values:
        return None
    n = len(pool_values)
    if invert:
        rank = sum(1 for v in pool_values if v is not None and v > value)
    else:
        rank = sum(1 for v in pool_values if v is not None and v < value)
    return round(rank / n, 4)


# ═══════════════════ Advanced career pool (Nov 26 #29) ═══════════════════
# Stats that light up the Career Comparison > Advanced tab, mirroring the
# Player Stats > Advanced Overall Efficiency section exactly. Each stat's
# invert flag determines whether lower = better (TOV% only).
#
# Historical sources per past season:
#   league_base.json      — per-player PTS/REB/AST/STL/BLK/FGA/FTA/TEAM_ID/MIN/GP
#   league_advanced.json  — per-player REB%/AST%/TM_TOV%/EFG%/TS%/USG% (NBA.com direct)
#   team_base.json        — per-team TmMP (for STL%/BLK% formula)
#   team_opponent.json    — per-team OppFGA/OppFG3A/OppFTA/OppOREB/OppTOV (formula)
#
# Formulas (Basketball Reference convention; see transform_defensive_rates.py):
#   OppPoss = OppFGA + 0.4*OppFTA - 1.07*(OppOREB/(OppOREB+TmDREB))*(OppFGA-OppFGM) + OppTOV
#   STL% = 100 * STL * TmMP / (MP * OppPoss)
#   BLK% = 100 * BLK * TmMP / (MP * (OppFGA - OppFG3A))
#   FTr  = FTA / FGA

ADV_PCTILE_SPEC = {
    "reb_pct":  False,
    "ast_pct":  False,
    "stl_pct":  False,
    "blk_pct":  False,
    "tov_pct":  True,    # lower = better (fewer turnovers per possession)
    "efg_pct":  False,
    "ts_pct":   False,
    "fta_rate": False,
}


def _load_team_pools(season):
    """Load team_base + team_opponent for a past season and return a dict
    keyed by TEAM_ID with the formula inputs:
      { team_id: {tm_mp, tm_dreb, opp_fga, opp_fgm, opp_fg3a, opp_fta,
                  opp_oreb, opp_tov, opp_poss} }
    All values are per-game. Returns None if either file is missing."""
    base_fp = HISTORICAL_POOL_DIR / season / "team_base.json"
    opp_fp  = HISTORICAL_POOL_DIR / season / "team_opponent.json"
    if not base_fp.exists() or not opp_fp.exists():
        return None

    def _rows(fp):
        with open(fp) as f:
            d = json.load(f)
        rs_list = d.get("resultSets", [])
        if not rs_list:
            return None, None
        rs = rs_list[0]
        return rs.get("headers", []), rs.get("rowSet", [])

    bh, br = _rows(base_fp)
    oh, or_ = _rows(opp_fp)
    if not bh or not oh:
        return None

    bi = {name: bh.index(name) for name in ["TEAM_ID", "MIN", "DREB"] if name in bh}
    oi_names = ["TEAM_ID", "OPP_FGA", "OPP_FGM", "OPP_FG3A", "OPP_FTA", "OPP_OREB", "OPP_TOV"]
    oi = {name: oh.index(name) for name in oi_names if name in oh}

    # Build per-team base lookup
    base_by_team = {}
    for row in br:
        tid = row[bi["TEAM_ID"]]
        base_by_team[tid] = {
            "tm_mp":   row[bi["MIN"]]   or 0,  # already per-game (team MPG)
            "tm_dreb": row[bi["DREB"]]  or 0,
        }

    # Build the full pool by joining opp into base; compute OppPoss once.
    pool = {}
    for row in or_:
        tid = row[oi["TEAM_ID"]]
        if tid not in base_by_team:
            continue
        opp_fga  = row[oi["OPP_FGA"]]  or 0
        opp_fgm  = row[oi["OPP_FGM"]]  or 0
        opp_fg3a = row[oi["OPP_FG3A"]] or 0
        opp_fta  = row[oi["OPP_FTA"]]  or 0
        opp_oreb = row[oi["OPP_OREB"]] or 0
        opp_tov  = row[oi["OPP_TOV"]]  or 0
        tm_dreb  = base_by_team[tid]["tm_dreb"]

        # OppPoss — Basketball Reference formula (per-game; units cancel downstream)
        oreb_total = opp_oreb + tm_dreb
        oreb_ratio = (opp_oreb / oreb_total) if oreb_total > 0 else 0
        opp_poss = opp_fga + 0.4 * opp_fta - 1.07 * oreb_ratio * (opp_fga - opp_fgm) + opp_tov

        pool[tid] = {
            "tm_mp":    base_by_team[tid]["tm_mp"],
            "opp_poss": opp_poss,
            "opp_fga":  opp_fga,
            "opp_fg3a": opp_fg3a,
        }
    return pool


def _load_advanced_career_pool(season):
    """Build the qualified-player pool for the Advanced career view for one
    past season. Combines league_base (STL/BLK/FGA/FTA/MIN/TEAM_ID), the
    league Advanced pool (direct REB%/AST%/TM_TOV%/EFG%/TS%), and team pools
    (for STL%/BLK% formula). Returns a list of {player_id, team_id, <8 stats>}
    dicts for players with >=500 total MIN. Returns None if any required
    pool file is missing."""
    base_fp = HISTORICAL_POOL_DIR / season / "league_base.json"
    adv_fp  = HISTORICAL_POOL_DIR / season / "league_advanced.json"
    if not base_fp.exists() or not adv_fp.exists():
        return None

    team_pool = _load_team_pools(season)
    if team_pool is None:
        return None

    with open(base_fp) as f:
        base_data = json.load(f)
    with open(adv_fp) as f:
        adv_data = json.load(f)

    base_rs = base_data["resultSets"][0]
    adv_rs = adv_data["resultSets"][0]
    bh, br = base_rs["headers"], base_rs["rowSet"]
    ah, ar = adv_rs["headers"], adv_rs["rowSet"]

    # Index advanced rows by player_id for lookup
    api = ah.index("PLAYER_ID")
    adv_by_pid = {row[api]: row for row in ar}

    # Column indices from base pool
    bi = {name: bh.index(name) for name in [
        "PLAYER_ID", "TEAM_ID", "GP", "MIN", "STL", "BLK",
        "FGA", "FTA",
    ] if name in bh}
    # Column indices from advanced pool
    ai = {name: ah.index(name) for name in [
        "REB_PCT", "AST_PCT", "TM_TOV_PCT", "EFG_PCT", "TS_PCT",
    ] if name in ah}

    pool = []
    for row in br:
        gp = row[bi["GP"]] or 0
        mpg = row[bi["MIN"]] or 0
        if gp * mpg < HISTORICAL_MIN_TOTAL:
            continue

        pid = row[bi["PLAYER_ID"]]
        tid = row[bi["TEAM_ID"]]

        adv_row = adv_by_pid.get(pid)
        if adv_row is None:
            continue  # player not in advanced pool (shouldn't happen but guard)
        team = team_pool.get(tid)
        if team is None:
            continue  # TEAM_ID = 0 (traded TOT row) — skip; the per-team rows
                      # for this player are handled separately above.

        stl = row[bi["STL"]] or 0
        blk = row[bi["BLK"]] or 0
        fga = row[bi["FGA"]] or 0
        fta = row[bi["FTA"]] or 0

        # STL% / BLK% formulas — BBR convention; per-game inputs, units cancel.
        stl_pct = (100 * stl * team["tm_mp"] / (mpg * team["opp_poss"])) if (mpg > 0 and team["opp_poss"] > 0) else None
        blk_denom = team["opp_fga"] - team["opp_fg3a"]
        blk_pct = (100 * blk * team["tm_mp"] / (mpg * blk_denom)) if (mpg > 0 and blk_denom > 0) else None
        # Store as 0-1 decimals to match the convention used for TS%/eFG%/etc.
        if stl_pct is not None:
            stl_pct = stl_pct / 100.0
        if blk_pct is not None:
            blk_pct = blk_pct / 100.0

        fta_rate = (fta / fga) if fga > 0 else None

        pool.append({
            "player_id": pid,
            "team_id":   tid,
            "reb_pct":   adv_row[ai["REB_PCT"]]    if "REB_PCT"    in ai else None,
            "ast_pct":   adv_row[ai["AST_PCT"]]    if "AST_PCT"    in ai else None,
            "stl_pct":   stl_pct,
            "blk_pct":   blk_pct,
            # NBA.com returns TM_TOV_PCT on percent scale (13.7 means 13.7%),
            # unlike REB_PCT/AST_PCT/TS_PCT/EFG_PCT which are decimals (0.083).
            # Normalize to decimal here so the frontend handles all _pct
            # fields the same way (multiply by 100 for display).
            "tov_pct":   (adv_row[ai["TM_TOV_PCT"]] / 100.0) if ("TM_TOV_PCT" in ai and adv_row[ai["TM_TOV_PCT"]] is not None) else None,
            "efg_pct":   adv_row[ai["EFG_PCT"]]    if "EFG_PCT"    in ai else None,
            "ts_pct":    adv_row[ai["TS_PCT"]]     if "TS_PCT"     in ai else None,
            "fta_rate":  fta_rate,
        })
    return pool


def _attach_advanced_percentiles(seasons, adv_pools, current_season):
    """For each past season entry in seasons, look up the player's row in
    the advanced career pool and attach <stat>_pctile fields for the 8
    Overall Efficiency stats. Uses the player_id from each entry? — not
    present; we pass it in alongside through the calling run()."""
    # NOTE: see run() — this is called per-player with a known player_id,
    # so we take it as an arg.
    raise NotImplementedError  # replaced below


def _attach_advanced_percentiles_for_player(seasons, player_id, adv_pools, current_season):
    """Attach advanced percentiles to each past season entry. For each
    season, find the player's row in that season's advanced career pool
    (by player_id) and compute pctile for each of the 8 stats against
    the pool. If the player wasn't in the pool (didn't qualify), the
    season's own stat values stay but no pctiles are attached."""
    for entry in seasons:
        sid = entry["season"]
        if sid == current_season:
            continue  # frontend reads pctiles from the live player object

        pool = adv_pools.get(sid)
        if pool is None:
            continue  # historical fetch not done for this season

        # Find this player's row in the pool
        player_row = next((p for p in pool if p["player_id"] == player_id), None)
        if player_row is None:
            # Player didn't qualify in that season's pool (<500 MIN).
            for key in ADV_PCTILE_SPEC:
                entry[f"{key}_pctile"] = None
            continue

        # Also copy the player's own Advanced stat values onto the season
        # entry so the frontend can display them (e.g. entry["reb_pct"] = 0.08).
        for key in ADV_PCTILE_SPEC:
            entry[key] = player_row.get(key)

        # Compute pctile for each stat against the full pool.
        for key, invert in ADV_PCTILE_SPEC.items():
            pool_values = [p[key] for p in pool if p.get(key) is not None]
            entry[f"{key}_pctile"] = _percentile(player_row.get(key), pool_values, invert=invert)


def _attach_percentiles(seasons, pools, current_season):
    """Mutate each entry in `seasons` to add `<stat>_pctile` fields computed
    against the historical pool for its season. The current season is left
    without pctile fields on this path — the frontend reuses the player's
    existing current-season percentiles that live elsewhere on the player
    record (Decision 2a)."""
    for entry in seasons:
        sid = entry["season"]
        if sid == current_season:
            continue  # frontend reads pctiles from the live player object

        pool = pools.get(sid)
        if pool is None:
            # Historical fetch not done for this season yet. Leave pctiles
            # absent — the frontend treats absence as "no color".
            continue

        # Did this player qualify in that season's pool? Same threshold as
        # the pool filter itself, so a non-qualifier gets no color anywhere.
        gp = entry.get("gp") or 0
        mpg = entry.get("min") or 0
        if gp * mpg < HISTORICAL_MIN_TOTAL:
            for key in PCTILE_SPEC:
                entry[f"{key}_pctile"] = None
            continue

        for key, invert in PCTILE_SPEC.items():
            pool_values = [p[key] for p in pool if p.get(key) is not None]
            entry[f"{key}_pctile"] = _percentile(entry.get(key), pool_values, invert=invert)


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


# Maps career.seasons[].<key> → the corresponding top-level player-object
# pctile key used by the main dashboard. Most keys are named the same; a
# handful of per-game counting stats differ (pts vs ppg, etc.) because the
# main dashboard uses per-game-abbreviated names while career.seasons uses
# the standard STL/PTS/REB vocabulary.
CURRENT_PCTILE_SRC = {
    # Traditional tab stats (#28) — most keys differ from source because
    # the main dashboard uses per-game-abbreviated names (ppg vs pts).
    "pts":     "ppg_pctile",
    "reb":     "rpg_pctile",
    "ast":     "apg_pctile",
    "stl":     "spg_pctile",
    "blk":     "bpg_pctile",
    "tov":     "tov_pctile",      # already inverted upstream (low TOV = high pctile)
    "fg_pct":  "fg_pct_pctile",
    "fg3_pct": "fg3_pct_pctile",
    "ft_pct":  "ft_pct_pctile",
    "ts_pct":  "ts_pct_pctile",
    "efg_pct": "efg_pct_pctile",
    # Advanced tab stats (#29) — all identity-mapped (same name on both
    # the player object and the career.seasons entry).
    "reb_pct":  "reb_pct_pctile",
    "ast_pct":  "ast_pct_pctile",
    "stl_pct":  "stl_pct_pctile",
    "blk_pct":  "blk_pct_pctile",
    "tov_pct":  "tov_pct_pctile",  # already inverted upstream
    "fta_rate": "fta_rate_pctile",
}

# Map of (career.seasons field) -> (player object source field) for the raw
# Advanced stat VALUES themselves (not the pctiles). Used for the current-
# season entry so the frontend reads e.g. entry["reb_pct"] the same way it
# reads it from historical-season entries. Traditional values (pts/reb/ast)
# are already there from _season_breakdowns; Advanced values aren't, because
# PlayerCareerStats doesn't carry them.
CURRENT_ADV_VALUE_SRC = {
    "reb_pct":  "reb_pct",
    "ast_pct":  "ast_pct",
    "stl_pct":  "stl_pct",
    "blk_pct":  "blk_pct",
    "tov_pct":  "tov_pct",
    "efg_pct":  "efg_pct",
    "ts_pct":   "ts_pct",
    "fta_rate": "fta_rate",
}


def _attach_current_season_pctiles(seasons, player, current_season):
    """Copy the player's existing current-season percentiles onto the career
    season entry for the current season (Decision 2a — keeps current-season
    numbers in lockstep with the Player Stats table and every other surface).
    Also copies the raw Advanced stat values (reb_pct, ast_pct, etc.) so the
    frontend can render them identically to historical-season entries.
    Values are already 0-1 decimals on the player object, so no conversion."""
    for entry in seasons:
        if entry["season"] != current_season:
            continue
        for key, src_field in CURRENT_PCTILE_SRC.items():
            entry[f"{key}_pctile"] = player.get(src_field)
        for key, src_field in CURRENT_ADV_VALUE_SRC.items():
            entry[key] = player.get(src_field)
        break


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

    # ─── Pass 1: build each player's career block (incl. the seasons array) ───
    enriched = 0
    missing = 0
    all_past_seasons = set()
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

        # Collect past seasons across all players so we can preload each pool
        # exactly once below rather than per-player.
        for s in block.get("seasons", []):
            sid = s.get("season")
            if sid and sid != SEASON:
                all_past_seasons.add(sid)

    # ─── Pass 2: preload every needed historical pool once, then attach pctiles ───
    # Preloading avoids reading the same files once per player (14 Hawks ×
    # 13 past seasons × 2 pool types = 364 reads vs 26 with preloading).
    # A missing pool file (fetch not run yet for that season) just means we
    # skip pctiles for that season — the frontend treats absence as "no color".
    pools = {}
    pools_missing = []
    for sid in sorted(all_past_seasons):
        pool = _load_historical_pool(sid)
        if pool is None:
            pools_missing.append(sid)
        else:
            pools[sid] = pool

    # #29 Nov 26: Advanced pool — joins league_base + league_advanced + team
    # pools to produce per-season pools of qualified players with their 8
    # Overall Efficiency stats already computed.
    adv_pools = {}
    adv_pools_missing = []
    for sid in sorted(all_past_seasons):
        pool = _load_advanced_career_pool(sid)
        if pool is None:
            adv_pools_missing.append(sid)
        else:
            adv_pools[sid] = pool

    for player in hawks.get("players", []):
        seasons = player.get("career", {}).get("seasons", [])
        if seasons:
            _attach_percentiles(seasons, pools, SEASON)
            _attach_advanced_percentiles_for_player(seasons, player["id"], adv_pools, SEASON)
            _attach_current_season_pctiles(seasons, player, SEASON)

    with open(data_path, "w") as f:
        json.dump(hawks, f, indent=2)

    # Report what landed and (importantly) what didn't, so a missing historical
    # fetch doesn't fail silently.
    print(f"[transform-player-career] enriched {enriched} players, missing {missing}")
    if pools:
        print(f"[transform-player-career] loaded {len(pools)} historical pools: "
              f"{', '.join(sorted(pools.keys()))}")
    if pools_missing:
        print(f"[transform-player-career] WARNING: no Base pool for seasons "
              f"{', '.join(pools_missing)} — career-view Traditional pctiles skipped. "
              f"Run: python3 -m pipeline.fetch_league_historical "
              f"{' '.join(pools_missing)}")
    if adv_pools:
        print(f"[transform-player-career] loaded {len(adv_pools)} Advanced pools")
    if adv_pools_missing:
        print(f"[transform-player-career] WARNING: no Advanced pool for seasons "
              f"{', '.join(adv_pools_missing)} — career-view Advanced pctiles skipped. "
              f"Run: python3 -m pipeline.fetch_league_historical --measure advanced "
              f"{' '.join(adv_pools_missing)} && "
              f"python3 -m pipeline.fetch_team_historical "
              f"{' '.join(adv_pools_missing)}")


if __name__ == "__main__":
    run()
