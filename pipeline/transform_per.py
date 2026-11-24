"""
Compute John Hollinger's Player Efficiency Rating (PER) for every NBA
player and merge onto hawksData (and the league leaderboards). Uses
existing raw files — no new NBA.com fetches.

Formula source: Basketball Reference's "About PER" page. League average
is normalized to 15.00 by construction; the metric is pace-adjusted.

Writes:
  - player.per        — the computed PER (float, league avg = 15.00)
  - player.pie        — the renamed field that used to be stored under
                        .per (NBA.com's Player Impact Estimate)
"""

import json
import glob
from pathlib import Path

from pipeline.config import SEASON, RAW_DATA_DIR, HAWKS_DATA_FILENAME


def _latest(pattern):
    files = sorted(glob.glob(f"{RAW_DATA_DIR}/{SEASON}/{pattern}"))
    return files[-1] if files else None


def _load_rs(path, name):
    """Return (headers, rows) for a named resultSet in a raw NBA.com file."""
    with open(path) as f:
        data = json.load(f)
    for rs in data.get("resultSets", []):
        if rs.get("name") == name:
            return rs.get("headers", []), rs.get("rowSet", [])
    return [], []


def _idx(headers):
    return {h: i for i, h in enumerate(headers)}


def _sum_totals(rows, idx, cols):
    """Sum per-game values × GP across all rows to get league totals.
    Per-game × GP = total; summing player totals = league total."""
    gp_i = idx["GP"]
    totals = {c: 0.0 for c in cols}
    for row in rows:
        gp = row[gp_i] or 0
        if gp == 0:
            continue
        for c in cols:
            v = row[idx[c]]
            if v is not None:
                totals[c] += v * gp
    return totals


def compute_per(players_headers, players_rows, teams_base_headers, teams_base_rows, teams_adv_headers, teams_adv_rows):
    """Return {player_id: per} for every player with MIN > 0."""
    p = _idx(players_headers)
    tb = _idx(teams_base_headers)
    ta = _idx(teams_adv_headers)

    # ---- League totals from player per-game × GP ----
    lg = _sum_totals(
        players_rows, p,
        ["PTS", "FGA", "OREB", "TOV", "FTA", "REB", "AST", "FGM", "FTM", "PF"],
    )
    # Guard against div-by-zero on empty data (preseason).
    if lg["FGM"] == 0 or lg["FTM"] == 0 or lg["PF"] == 0:
        return {}

    # ---- League constants used in uPER ----
    # VOP (Value of Possession), DRB%, factor — all from league totals.
    vop = lg["PTS"] / (lg["FGA"] - lg["OREB"] + lg["TOV"] + 0.44 * lg["FTA"])
    drb_pct = (lg["REB"] - lg["OREB"]) / lg["REB"]
    factor = (2.0 / 3.0) - (0.5 * (lg["AST"] / lg["FGM"])) / (2.0 * (lg["FGM"] / lg["FTM"]))

    # ---- Team lookups: tm_AST, tm_FGM (per-game is fine since the
    #      formula only uses the ratio tm_AST/tm_FGM) and tm_pace. ----
    # Base team: TEAM_ID → (tm_AST, tm_FGM) per-game
    tm_ast_fg = {}
    for row in teams_base_rows:
        tid = row[tb["TEAM_ID"]]
        tm_ast_fg[tid] = (row[tb["AST"]] or 0, row[tb["FGM"]] or 0)
    # Advanced team: TEAM_ID → pace (per-game)
    tm_pace = {}
    for row in teams_adv_rows:
        tid = row[ta["TEAM_ID"]]
        tm_pace[tid] = row[ta["PACE"]]

    # ---- League pace: minute-weighted average of team paces ----
    # (A little less rigorous than possession-weighted, but very close
    # within the modern NBA where every team plays 48-minute games.)
    total_min = 0
    pace_weighted = 0
    for row in teams_adv_rows:
        m = (row[ta["MIN"]] or 0) * (row[ta["GP"]] or 0)
        pace = row[ta["PACE"]]
        if m > 0 and pace is not None:
            pace_weighted += pace * m
            total_min += m
    lg_pace = pace_weighted / total_min if total_min else 0

    # ---- Per-player uPER → aPER (stash raw aPER + MIN for normalization) ----
    raw = []  # [(player_id, min_total, aPER), ...]
    for row in players_rows:
        pid = row[p["PLAYER_ID"]]
        mpg = row[p["MIN"]] or 0
        gp = row[p["GP"]] or 0
        min_total = mpg * gp
        if mpg == 0:
            continue

        tid = row[p["TEAM_ID"]]
        tm_ast, tm_fg = tm_ast_fg.get(tid, (0, 0))
        tm_p = tm_pace.get(tid, lg_pace)
        if tm_fg == 0 or tm_p == 0:
            continue
        tm_ast_fg_ratio = tm_ast / tm_fg

        # Shorthand for per-game player stats
        fg3m = row[p["FG3M"]] or 0
        ast = row[p["AST"]] or 0
        fgm = row[p["FGM"]] or 0
        fga = row[p["FGA"]] or 0
        ftm = row[p["FTM"]] or 0
        fta = row[p["FTA"]] or 0
        tov = row[p["TOV"]] or 0
        oreb = row[p["OREB"]] or 0
        reb = row[p["REB"]] or 0
        stl = row[p["STL"]] or 0
        blk = row[p["BLK"]] or 0
        pf = row[p["PF"]] or 0

        # Hollinger uPER (per-minute). Writes verbatim from BR's formula.
        uper = (1.0 / mpg) * (
            fg3m
            + (2.0 / 3.0) * ast
            + (2.0 - factor * tm_ast_fg_ratio) * fgm
            + (ftm * 0.5 * (1.0 + (1.0 - tm_ast_fg_ratio) + (2.0 / 3.0) * tm_ast_fg_ratio))
            - vop * tov
            - vop * drb_pct * (fga - fgm)
            - vop * 0.44 * (0.44 + 0.56 * drb_pct) * (fta - ftm)
            + vop * (1.0 - drb_pct) * (reb - oreb)
            + vop * drb_pct * oreb
            + vop * stl
            + vop * drb_pct * blk
            - pf * ((lg["FTM"] / lg["PF"]) - 0.44 * (lg["FTA"] / lg["PF"]) * vop)
        )

        # Pace adjust
        aper = (lg_pace / tm_p) * uper
        raw.append((pid, min_total, aper))

    # ---- Normalize so league average aPER maps to 15.00 ----
    total_min = sum(m for _, m, _ in raw)
    lg_aper = sum(aper * m for _, m, aper in raw) / total_min if total_min else 1
    per_by_pid = {pid: aper * 15.0 / lg_aper for pid, _, aper in raw}

    # ---- Percentile rank each PER within the league distribution so the
    #      Advanced tab's percentile bar can render it like any other stat.
    #      Qualifier scales with how far the season has progressed, mirroring
    #      NBA.com and Basketball-Reference leaderboard conventions: a player
    #      qualifies if their total minutes clear a threshold prorated to
    #      500 MIN at a full 82-game season.
    #
    #      Without this proration the pool collapses early in the season.
    #      At Nov 23 only ~45 players league-wide clear 500 MIN, and they're
    #      almost all 35+ mpg workhorses, pushing the pool median to ~17.3
    #      and making a solid 16 PER look like the 24th percentile.
    #
    #      games_elapsed = max GP seen across the league (the furthest-along
    #      team's game count). Floor of 50 MIN handles opening weekend when
    #      the formula would otherwise accept a 1-minute cameo.
    games_elapsed = max((row[p["GP"]] or 0) for row in players_rows)
    QUALIFY_MIN = max(50, round(500 * games_elapsed / 82))
    qualified_pers = sorted(
        per for pid, min_total, _ in raw for per in [per_by_pid[pid]]
        if min_total >= QUALIFY_MIN
    )
    n = len(qualified_pers)
    def pctile(per_val):
        if n == 0:
            return None
        # Rank (number of qualified players with lower PER) / n × 100.
        # Bisect-left gives count of strictly-lower values.
        import bisect
        rank = bisect.bisect_left(qualified_pers, per_val)
        # Store as 0–1 float (matching every other *_pctile field in hawksData).
        return round(rank / n, 3)

    return {pid: {"per": per_by_pid[pid], "per_pctile": pctile(per_by_pid[pid])} for pid in per_by_pid}


def run():
    raw_dir = Path(RAW_DATA_DIR) / SEASON

    pb_path = _latest("league_base_*.json")
    tb_path = _latest("team_base_*.json")
    ta_path = _latest("team_advanced_*.json")
    if not all([pb_path, tb_path, ta_path]):
        print("[per] missing one of league_base/team_base/team_advanced — skipping")
        return

    p_h, p_r = _load_rs(pb_path, "LeagueDashPlayerStats")
    tb_h, tb_r = _load_rs(tb_path, "LeagueDashTeamStats")
    ta_h, ta_r = _load_rs(ta_path, "LeagueDashTeamStats")

    per_by_pid = compute_per(p_h, p_r, tb_h, tb_r, ta_h, ta_r)
    print(f"[per] computed PER for {len(per_by_pid)} players")

    # Merge onto Hawks players in hawksData
    data_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(data_path) as f:
        hawks = json.load(f)

    enriched = 0
    for player in hawks.get("players", []):
        pid = player.get("id")
        # Rename existing .per → .pie (it's actually PIE from NBA.com)
        if "per" in player and "pie" not in player:
            player["pie"] = player["per"]
        # Write computed PER + its league percentile rank
        if pid in per_by_pid:
            player["per"] = round(per_by_pid[pid]["per"], 2)
            player["per_pctile"] = per_by_pid[pid]["per_pctile"]
            enriched += 1

    with open(data_path, "w") as f:
        json.dump(hawks, f, indent=2)
    print(f"[per] enriched {enriched} Hawks players in {data_path}")

    # Also stamp onto league leaderboards (so leaderboard pages can rank by PER)
    lb_path = Path("app/public") / f"league_leaderboards-{SEASON}.json"
    if lb_path.exists():
        with open(lb_path) as f:
            lb = json.load(f)
        enr_lb = 0
        for player in lb.get("players", []):
            pid = player.get("id")
            if "per" in player and "pie" not in player:
                player["pie"] = player["per"]
            if pid in per_by_pid:
                player["per"] = round(per_by_pid[pid]["per"], 2)
                player["per_pctile"] = per_by_pid[pid]["per_pctile"]
                enr_lb += 1
        with open(lb_path, "w") as f:
            json.dump(lb, f, indent=2)
        print(f"[per] enriched {enr_lb} players in {lb_path.name}")


if __name__ == "__main__":
    run()
