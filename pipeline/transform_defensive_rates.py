"""
Compute Hawks players' STL% and BLK% and percentile vs full league.

NBA.com's API does not provide STL% or BLK% directly. We compute them from
per-game steals/blocks + minutes + team-level opponent possessions and shot
attempts, using the Basketball Reference formulas:

    OppPoss = OppFGA + 0.4*OppFTA
            - 1.07 * (OppOREB / (OppOREB + TmDREB)) * (OppFGA - OppFGM)
            + OppTOV

    STL% = 100 * (STL * TmMP) / (MP * OppPoss)
    BLK% = 100 * (BLK * TmMP) / (MP * (OppFGA - OppFG3A))

Where TmMP = team game-minutes played, MP = player minutes played,
OppPoss = opponent possessions. Note: Basketball Reference's published
formula uses "TmMP / 5" because their "TmMP" convention means total
player-minutes (= game-minutes * 5). NBA.com's team MIN column is already
game-minutes, so we drop the /5. All inputs are per-game; units cancel.

The league percentile pool is built by computing STL%/BLK% for every NBA
player (using THEIR team's opponent-pace numbers), filtered to players with
MP*GP >= MIN_PLAYED_THRESHOLD so tiny samples don't skew percentiles.

Reads: data/raw/<SEASON>/league_base_<date>.json       (per-player STL/BLK/MP/GP/TEAM_ID)
       data/raw/<SEASON>/team_base_<date>.json         (TmDREB, TmMP per team)
       data/raw/<SEASON>/team_opponent_<date>.json     (OppFGA/FGM/FG3A/FTA/OREB/TOV per team)
Reads+writes: app/public/hawksData.json
             (adds stl_pct, blk_pct, stl_pct_pctile, blk_pct_pctile to each Hawks player)

Must run AFTER transform.py (writes hawksData.json) and after fetch.py
(writes the league_base, team_base, team_opponent raw files).
"""

import json
from pathlib import Path

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

HAWKS_DATA = Path("app/public") / HAWKS_DATA_FILENAME
RAW_DIR = Path("data/raw") / SEASON

# Match transform.py's MIN_PLAYED_THRESHOLD. Pool excludes players below this,
# so a 2-minute cameo with 1 steal doesn't register as a 50% STL%.
MIN_PLAYED_THRESHOLD = 200


def latest_file(pattern: str) -> Path:
    files = sorted(RAW_DIR.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No {pattern} in {RAW_DIR} — run fetch.py first")
    return files[-1]


def load_rows(pattern: str) -> list[dict]:
    data = json.loads(latest_file(pattern).read_text())
    rs = data["resultSets"][0]
    return [dict(zip(rs["headers"], row)) for row in rs["rowSet"]]


def compute_team_pace(team_base_rows: list[dict], team_opp_rows: list[dict]) -> dict:
    """Return {team_id: {opp_poss, opp_fga_minus_fg3a, tm_mp}} per-game values."""
    base_by_id = {r["TEAM_ID"]: r for r in team_base_rows}
    pace = {}
    for opp in team_opp_rows:
        tid = opp["TEAM_ID"]
        base = base_by_id.get(tid)
        if base is None:
            continue
        opp_fga  = opp.get("OPP_FGA")  or 0
        opp_fgm  = opp.get("OPP_FGM")  or 0
        opp_fg3a = opp.get("OPP_FG3A") or 0
        opp_fta  = opp.get("OPP_FTA")  or 0
        opp_oreb = opp.get("OPP_OREB") or 0
        opp_tov  = opp.get("OPP_TOV")  or 0
        tm_dreb  = base.get("DREB")    or 0
        tm_mp    = base.get("MIN")     or 0
        oreb_rate_denom = (opp_oreb + tm_dreb) or 1  # avoid div/0
        opp_poss = (
            opp_fga
            + 0.4 * opp_fta
            - 1.07 * (opp_oreb / oreb_rate_denom) * (opp_fga - opp_fgm)
            + opp_tov
        )
        pace[tid] = {
            "opp_poss": opp_poss,
            "opp_fga_minus_fg3a": opp_fga - opp_fg3a,
            "tm_mp": tm_mp,
        }
    return pace


def compute_player_rates(player: dict, team_pace: dict) -> tuple[float | None, float | None]:
    """Return (stl_pct, blk_pct) for one player row, or (None, None) if insufficient data."""
    tid = player.get("TEAM_ID")
    pace = team_pace.get(tid)
    if pace is None:
        return None, None
    mp  = player.get("MIN")
    stl = player.get("STL")
    blk = player.get("BLK")
    tm_mp = pace["tm_mp"]
    opp_poss = pace["opp_poss"]
    opp_2pa = pace["opp_fga_minus_fg3a"]
    if not mp or not tm_mp or not opp_poss:
        return None, None
    stl_pct = (100 * (stl or 0) * tm_mp) / (mp * opp_poss) if stl is not None else None
    blk_pct = (100 * (blk or 0) * tm_mp) / (mp * opp_2pa)  if (blk is not None and opp_2pa) else None
    return stl_pct, blk_pct


def compute_percentile(value, pool: list) -> float | None:
    valid = [v for v in pool if v is not None]
    if not valid or value is None:
        return None
    below = sum(1 for v in valid if v < value)
    return below / len(valid)


def run():
    league   = load_rows("league_base_*.json")
    tm_base  = load_rows("team_base_*.json")
    tm_opp   = load_rows("team_opponent_*.json")
    print(f"[def_rates] loaded {len(league)} league players, "
          f"{len(tm_base)} team_base, {len(tm_opp)} team_opponent rows")

    team_pace = compute_team_pace(tm_base, tm_opp)
    print(f"[def_rates] built pace table for {len(team_pace)} teams")

    # Compute per-player rates for ALL league players (for the pool),
    # filtered to meaningful minutes.
    stl_pool: list[float] = []
    blk_pool: list[float] = []
    rates_by_pid: dict[int, tuple[float | None, float | None]] = {}
    for row in league:
        stl_pct, blk_pct = compute_player_rates(row, team_pace)
        rates_by_pid[row["PLAYER_ID"]] = (stl_pct, blk_pct)
        total_min = (row.get("MIN") or 0) * (row.get("GP") or 0)
        if total_min >= MIN_PLAYED_THRESHOLD:
            if stl_pct is not None: stl_pool.append(stl_pct)
            if blk_pct is not None: blk_pool.append(blk_pct)
    print(f"[def_rates] pool: {len(stl_pool)} STL%, {len(blk_pool)} BLK% "
          f"(min {MIN_PLAYED_THRESHOLD} total minutes to qualify)")

    hawks = json.loads(HAWKS_DATA.read_text())
    updated = 0
    for player in hawks.get("players", []):
        stl_pct, blk_pct = rates_by_pid.get(player["id"], (None, None))
        player["stl_pct"] = stl_pct
        player["blk_pct"] = blk_pct
        player["stl_pct_pctile"] = compute_percentile(stl_pct, stl_pool)
        player["blk_pct_pctile"] = compute_percentile(blk_pct, blk_pool)
        updated += 1

    # Add stl/blk medians to the top-level league_medians dict transform.py
    # wrote earlier, so the Charts tab crosshair can read them from one place.
    def _median(vals):
        s = sorted(v for v in vals if v is not None)
        if not s: return None
        mid = len(s) // 2
        return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2
    medians = hawks.setdefault("league_medians", {})
    medians["stl_pct"] = _median(stl_pool)
    medians["blk_pct"] = _median(blk_pool)

    HAWKS_DATA.write_text(json.dumps(hawks, indent=2))
    def _fmt(v): return f"{v:.2f}" if v is not None else "n/a"
    print(f"[def_rates] wrote stl_pct/blk_pct onto {updated} Hawks players "
          f"(league medians: STL%={_fmt(medians['stl_pct'])}, BLK%={_fmt(medians['blk_pct'])})")


if __name__ == "__main__":
    run()
