"""
Compute league-wide shooting leaderboards per zone.

Reads:
  - data/raw/<SEASON>/base_<date>.json  (leaguedashplayerstats, latest file)
  - data/raw/<SEASON>/league_shots/shots_<pid>_<date>.json  (all league players)
Writes:
  - app/public/league_leaderboards.json

Includes every player meeting MIN_GP; frontend applies per-zone FGA filters
when rendering each leaderboard.

Must run AFTER fetch.py (base stats) and fetch_league_shots.py (shot files).
"""

import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
SHOTS_DIR = RAW_DIR / "league_shots"
from pipeline.config import LEADERBOARDS_FILENAME
OUT_PATH = Path("app/public") / LEADERBOARDS_FILENAME

MIN_GP = 5  # Lowered for early 2026-27 season; bump back to 20 after ~Nov 15

ZONE_MAP = {
    "Restricted Area":         "at_rim",
    "In The Paint (Non-RA)":   "paint",
    "Mid-Range":               "mid",
    "Left Corner 3":           "l_corner_3",
    "Right Corner 3":          "r_corner_3",
    "Above the Break 3":       "above_break_3",
}

OUTPUT_KEYS = [
    "at_rim", "paint", "mid",
    "corner_3",
    "l_corner_3", "r_corner_3",
    "above_break_3",
]

# Minimum FGA per zone to appear on that zone's leaderboard (frontend filter)
# Lowered for early 2026-27 season; restore to full-season floors (~Nov 15):
#   at_rim 50, paint 25, mid 20, corner_3 20, l_corner_3 10, r_corner_3 10, above_break_3 50
MIN_FGA = {
    "at_rim": 15,
    "paint": 10,
    "mid": 10,
    "corner_3": 8,
    "l_corner_3": 5,
    "r_corner_3": 5,
    "above_break_3": 15,
}

# Minimum attempt thresholds for the overall shooting leaderboards. Keys match
# the OVERALL_STAT_KEYS below so the frontend can look them up by stat key.
# FG%/eFG%/TS% share 50 FGA for consistency with the shot-based convention;
# FT% uses 25 FTA. For TS% specifically, FGA is a close proxy for TSA since
# TSA = FGA + 0.44*FTA; the 50 floor on FGA still catches no-free-throw jumper
# specialists who otherwise might slip through on a tiny TSA sample.
MIN_OVERALL = {
    "fg_pct":  {"attempts_field": "fga", "min": 50},
    "efg_pct": {"attempts_field": "fga", "min": 50},
    "ts_pct":  {"attempts_field": "fga", "min": 50},
    "ft_pct":  {"attempts_field": "fta", "min": 25},
}


def latest_file(pattern: str) -> Path | None:
    """Most recent file matching the glob pattern in RAW_DIR, or None."""
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def load_overall_stats() -> dict:
    """Return {pid: {fg_pct, efg_pct, ts_pct, ft_pct, fga, fta}} for every
    player with a row in league_base + league_advanced."""
    base_file = latest_file("league_base_*.json")
    adv_file  = latest_file("league_advanced_*.json")
    if base_file is None or adv_file is None:
        return {}

    base = json.loads(base_file.read_text())
    rs = next(r for r in base["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    bh = rs["headers"]
    pid_i = bh.index("PLAYER_ID")
    gp_i  = bh.index("GP")
    fga_i = bh.index("FGA")
    fgm_i = bh.index("FGM")
    fg_pct_i = bh.index("FG_PCT")
    efg_i = bh.index("EFG_PCT") if "EFG_PCT" in bh else None
    ft_pct_i = bh.index("FT_PCT")
    fta_i = bh.index("FTA")
    fg3m_i = bh.index("FG3M")

    # eFG% is sometimes absent from base stats (depends on which measure variant
    # the fetch asked for). If not present we compute it: (FGM + 0.5*FG3M)/FGA.
    out = {}
    for row in rs["rowSet"]:
        pid = row[pid_i]
        gp  = row[gp_i] or 0
        fga = row[fga_i] or 0
        fgm = row[fgm_i] or 0
        fta = row[fta_i] or 0
        fg3m = row[fg3m_i] or 0
        if efg_i is not None:
            efg = row[efg_i]
        else:
            efg = (fgm + 0.5 * fg3m) / fga if fga > 0 else None
        out[pid] = {
            "fg_pct":  row[fg_pct_i],
            "efg_pct": efg,
            "ft_pct":  row[ft_pct_i],
            # Per-game values (what leaguedashplayerstats returns by default):
            "fga":     fga,
            "fta":     fta,
            "fgm":     fgm,
            # Season totals, used for the minimum-attempts floors on the
            # leaderboards (floors like "50 FGA" are totals, not per-game):
            "fga_total": round(fga * gp),
            "fta_total": round(fta * gp),
            "fgm_total": round(fgm * gp),
        }

    # TS% comes from league_advanced since it needs TS_PCT.
    adv = json.loads(adv_file.read_text())
    rs = next(r for r in adv["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    ah = rs["headers"]
    pid_i = ah.index("PLAYER_ID")
    ts_i  = ah.index("TS_PCT")
    for row in rs["rowSet"]:
        pid = row[pid_i]
        if pid in out:
            out[pid]["ts_pct"] = row[ts_i]
        else:
            out[pid] = {"ts_pct": row[ts_i]}
    return out

def load_defense_stats() -> dict:
    """Return {pid: {spg, bpg, rpg}} for every player with a league_base row.
    All values are per-game — leaguedashplayerstats uses PerMode=PerGame by default."""
    base_file = latest_file("league_base_*.json")
    if base_file is None:
        return {}
    data = json.loads(base_file.read_text())
    rs = next(r for r in data["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    h = rs["headers"]
    pid_i = h.index("PLAYER_ID")
    stl_i = h.index("STL")
    blk_i = h.index("BLK")
    reb_i = h.index("REB")
    out = {}
    for row in rs["rowSet"]:
        out[row[pid_i]] = {
            "spg": row[stl_i],
            "bpg": row[blk_i],
            "rpg": row[reb_i],
        }
    return out


def load_hustle_stats() -> dict:
    """Return {pid: {contested_shots, deflections, box_outs, loose_balls_recovered,
    charges_drawn, screen_assists}} per-game, from the latest league_hustle file.
    Values are stored flat (not {value, pctile} wrapped like the Hawks-only hustle
    file) — the frontend adapter handles both shapes."""
    hustle_file = latest_file("league_hustle_*.json")
    if hustle_file is None:
        return {}
    data = json.loads(hustle_file.read_text())
    rs = data["resultSets"][0]
    h = rs["headers"]
    pid_i = h.index("PLAYER_ID")
    cs_i = h.index("CONTESTED_SHOTS")
    defl_i = h.index("DEFLECTIONS")
    bo_i = h.index("BOX_OUTS")
    lbr_i = h.index("LOOSE_BALLS_RECOVERED")
    cd_i = h.index("CHARGES_DRAWN")
    sa_i = h.index("SCREEN_ASSISTS")
    out = {}
    for row in rs["rowSet"]:
        out[row[pid_i]] = {
            "contested_shots":       row[cs_i],
            "deflections":           row[defl_i],
            "box_outs":              row[bo_i],
            "loose_balls_recovered": row[lbr_i],
            "charges_drawn":         row[cd_i],
            "screen_assists":        row[sa_i],
        }
    return out

def latest_shot_file_per_player() -> dict[int, Path]:
    """One file per player per day accumulates — keep the most recent per player."""
    by_player = {}
    for path in SHOTS_DIR.glob("shots_*.json"):
        parts = path.stem.split("_")  # shots_<pid>_<YYYY-MM-DD>
        if len(parts) != 3:
            continue
        _, pid_str, date_str = parts
        try:
            pid = int(pid_str)
        except ValueError:
            continue
        existing = by_player.get(pid)
        if existing is None or date_str > existing.stem.split("_")[2]:
            by_player[pid] = path
    return by_player


def load_player_bios() -> dict[int, dict]:
    """From the latest base_<date>.json, build {player_id: {name, team, gp}}."""
    base_file = latest_file("league_base_*.json")
    if base_file is None:
         raise FileNotFoundError("No league_base_*.json in data/raw — run fetch.py first")

    data = json.loads(base_file.read_text())
    # Raw NBA.com shape: resultSets is a list; each has name, headers, rowSet (list of lists)
    rs = next(r for r in data["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    headers = rs["headers"]
    rows = rs["rowSet"]

    # Look up column indices once (headers are a flat list, rows are parallel lists)
    pid_idx = headers.index("PLAYER_ID")
    name_idx = headers.index("PLAYER_NAME")
    team_idx = headers.index("TEAM_ABBREVIATION")
    gp_idx = headers.index("GP")

    bios = {}
    for row in rows:
        bios[row[pid_idx]] = {
            "name": row[name_idx],
            "team": row[team_idx],
            "gp": row[gp_idx],
        }
    return bios


def compute_zones(shot_file: Path) -> dict:
    """Aggregate one player's shots into zone totals (reads raw NBA.com field names)."""
    data = json.loads(shot_file.read_text())
    shots = data.get("Shot_Chart_Detail", [])

    totals = defaultdict(lambda: {"fga": 0, "fgm": 0})
    for s in shots:
        bucket = ZONE_MAP.get(s.get("SHOT_ZONE_BASIC"))
        if bucket is None:
            continue
        totals[bucket]["fga"] += 1
        totals[bucket]["fgm"] += s.get("SHOT_MADE_FLAG", 0)

    # Synthesize combined corner_3 from left + right
    totals["corner_3"]["fga"] = totals["l_corner_3"]["fga"] + totals["r_corner_3"]["fga"]
    totals["corner_3"]["fgm"] = totals["l_corner_3"]["fgm"] + totals["r_corner_3"]["fgm"]

    zones = {}
    for key in OUTPUT_KEYS:
        fga = totals[key]["fga"]
        fgm = totals[key]["fgm"]
        zones[key] = {
            "fga": fga,
            "fgm": fgm,
            "pct": round(fgm / fga, 4) if fga > 0 else None,
        }
    return zones


def run():
    bios = load_player_bios()
    shot_files = latest_shot_file_per_player()
    print(f"[leaderboards] {len(bios)} players in stats, {len(shot_files)} with shot files")

    overall_by_pid = load_overall_stats()
    print(f"[leaderboards] loaded overall shooting stats for {len(overall_by_pid)} players")

    defense_by_pid = load_defense_stats()
    print(f"[leaderboards] loaded defense stats for {len(defense_by_pid)} players")

    hustle_by_pid = load_hustle_stats()
    print(f"[leaderboards] loaded hustle stats for {len(hustle_by_pid)} players")

    players = []
    missing_bio = 0
    below_gp = 0
    for pid, path in shot_files.items():
        bio = bios.get(pid)
        if bio is None:
            missing_bio += 1
            continue
        if bio["gp"] < MIN_GP:
            below_gp += 1
            continue
        zones = compute_zones(path)
        players.append({
            "id": pid,
            "name": bio["name"],
            "team": bio["team"],
            "gp": bio["gp"],
            "zones": zones,
            "overall": overall_by_pid.get(pid, {}),
            "defense": defense_by_pid.get(pid, {}),
            "hustle":  hustle_by_pid.get(pid, {}),
        })

    # Sort alphabetically by name for stable git diffs
    players.sort(key=lambda p: p["name"])

    out = {
        "season": SEASON,
        "generated_at": datetime.now().astimezone().isoformat(),
        "min_gp": MIN_GP,
        "min_fga_per_zone": MIN_FGA,
        "min_overall": MIN_OVERALL,
        "players": players,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(
        f"[leaderboards] wrote {OUT_PATH} ({len(players)} qualified, "
        f"{below_gp} below {MIN_GP} GP, {missing_bio} missing bios, {size_kb:.1f} KB)"
    )


if __name__ == "__main__":
    run()