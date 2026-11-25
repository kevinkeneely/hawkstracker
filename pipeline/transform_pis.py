"""
Compute PIS — Possession Impact Score — for every NBA player and merge
onto hawksData + the league leaderboards.

A hawkstracker-original metric (Nov 24, 2026). Counts net possession value
created per 36 minutes, rewarding actions that extend our own possessions
(OReb) or end opponent possessions (DReb, STL, DEFLECTIONS, CHARGES,
LOOSE_BALLS_RECOVERED). Penalizes giving up our possession (TOV). Designed
to credit the Dyson Daniels archetype that PER undercounts — deflections
and loose-ball production are literally absent from Hollinger's PER
formula. See claude/advanced-metrics-plan.md for the design rationale.

Formula — all terms per 36 min:
  + 1.0  × OReb                    (extends own possession)
  + 1.0  × DReb                    (ends opp possession)
  + 1.0  × STL                     (ends opp possession)
  + 1.0  × CHARGES_DRAWN           (ends opp possession)
  + 0.5  × LOOSE_BALLS_RECOVERED   (team gains the loose ball)
  + 0.3  × DEFLECTIONS             (not all become TOVs — discount)
  + 0.44 × FTA                     (0.44 FTA ≈ one "shooting event" in TSA math)
  − 1.0  × TOV                     (gave up own possession)

Known limitations (noted for future revisit):
  - No foul penalty. NBA.com's per-game endpoint doesn't give us a
    shooting-vs-non-shooting breakdown, and total PF alone would
    double-count the charges-drawn upside (charges register as a PF on
    the offensive player). Skipped in v1; worth adding if we pull PFs
    separately.
  - Per-36 minutes rather than per-100 possessions. True possession rate
    needs player-level pace data; per-36 is a solid approximation.
  - Does not account for shot efficiency. A player with high PIS but
    bad shooting still registers as valuable here — intentional, since
    PER + FFOS already carry the efficiency signal. PIS is a specialist
    metric, not a one-number player rating.

Each PIS value → league-wide percentile among qualified players (same
prorated MIN threshold transform_per.py + transform_ffos.py use).

Reads+writes:
  app/public/hawksData-<SEASON>.json          (adds player.pis + .pis_pctile)
  app/public/league_leaderboards-<SEASON>.json (same)

Must run AFTER transform.py, transform_hustle, transform_league_leaderboards.
"""

import json
import bisect
from pathlib import Path
from pipeline.config import SEASON, HAWKS_DATA_FILENAME

# Per-36-min weights. All in units of "possessions created (or lost)
# per 36 min."
WEIGHTS = {
    "oreb":        1.0,
    "dreb":        1.0,
    "stl":         1.0,
    "charges":     1.0,
    "loose_balls": 0.5,
    "deflections": 0.3,
    "fta":         0.44,
    "tov":        -1.0,
}


def _pis_for_league_player(player):
    """Compute PIS for one league_leaderboards player. Returns None if
    required data is missing, so the player falls out of the pool."""
    overall = player.get("overall") or {}
    defense = player.get("defense") or {}
    hustle  = player.get("hustle")  or {}

    mpg = overall.get("mpg")
    if not mpg or mpg == 0:
        return None

    # per-36 conversion from per-game
    def p36(pg):
        return None if pg is None else pg * 36.0 / mpg

    orpg = defense.get("orpg")                       # OReb/g
    drpg = defense.get("drpg")                       # DReb/g
    spg  = defense.get("spg")                        # STL/g
    tov_pg = None                                    # TOVs — not on league player top-level
    # TOV is only exposed as a rate (tov_pct). To get per-game TOVs we'd
    # need the raw. For now, estimate TOV/g from tov_pct × usage × …;
    # but the cleanest proxy is to use `tov_pct` directly as a penalty.
    # However, we want PIS in action-counts, not rates. So we compute
    # TOV per 36 as: fga_per_game × (tov_pct / (1 - tov_pct)) is
    # ugly — simpler: NBA.com's `overall` block should include a tov
    # number, let's check.
    # Looking at the sample row keys: ['tov_pct'] — only rate, no count.
    # Fall back on: tov_p36 ≈ tov_pct × (fga + 0.44*fta + tov) per 36.
    # Since we need to solve a small identity, just approximate:
    #   if tov_pct = tov / (fga + 0.44*fta + tov), then
    #   tov = tov_pct × (fga + 0.44*fta) / (1 - tov_pct)
    fga_total = overall.get("fga_total")
    fta_total = overall.get("fta_total")
    tov_pct   = overall.get("tov_pct")
    gp = player.get("gp") or 0

    if None in (orpg, drpg, spg, fga_total, fta_total, tov_pct, gp) or gp == 0:
        return None

    deflections_p36 = hustle.get("deflections")       # already per 36
    charges_p36     = hustle.get("charges_drawn")     # already per 36
    loose_balls_p36 = hustle.get("loose_balls_recovered")

    if None in (deflections_p36, charges_p36, loose_balls_p36):
        return None

    # Back-calc TOVs per 36 from tov_pct.
    #   tov_pct = TOV / (FGA + 0.44*FTA + TOV) → TOV = tov_pct * (FGA + 0.44*FTA) / (1 - tov_pct)
    fga_pg = fga_total / gp
    fta_pg = fta_total / gp
    if tov_pct >= 1.0:  # guard against divide-by-zero; impossible but defensive
        return None
    tov_pg = tov_pct * (fga_pg + 0.44 * fta_pg) / (1.0 - tov_pct)
    tov_p36 = p36(tov_pg)

    oreb_p36 = p36(orpg)
    dreb_p36 = p36(drpg)
    stl_p36  = p36(spg)
    fta_p36  = p36(fta_pg)

    pis = (
        WEIGHTS["oreb"]        * oreb_p36
        + WEIGHTS["dreb"]        * dreb_p36
        + WEIGHTS["stl"]         * stl_p36
        + WEIGHTS["charges"]     * charges_p36
        + WEIGHTS["loose_balls"] * loose_balls_p36
        + WEIGHTS["deflections"] * deflections_p36
        + WEIGHTS["fta"]         * fta_p36
        + WEIGHTS["tov"]         * tov_p36
    )
    return {
        "pis": round(pis, 2),
        "min_total": overall.get("min_total") or 0,
    }


def run():
    lb_path = Path("app/public") / f"league_leaderboards-{SEASON}.json"
    with open(lb_path) as f:
        lb = json.load(f)
    players = lb.get("players", [])

    # Same prorated qualifier as PER + FFOS — shared pool semantics.
    games_elapsed = max((p.get("gp") or 0) for p in players)
    qualify_min = max(50, round(500 * games_elapsed / 82))

    # Compute PIS for every player; retain only qualified ones for the pctile pool.
    all_pis = {}  # pid → {pis, min_total}
    for p in players:
        pid = p.get("id")
        result = _pis_for_league_player(p)
        if result is not None:
            all_pis[pid] = result

    qualified_scores = sorted(
        r["pis"] for r in all_pis.values() if r["min_total"] >= qualify_min
    )
    n = len(qualified_scores)
    print(f"[pis] pool size: {n} players "
          f"(qualifier: MIN >= {qualify_min} at {games_elapsed} games elapsed)")

    def pctile(score):
        if n == 0:
            return None
        rank = bisect.bisect_left(qualified_scores, score)
        return round(rank / n, 4)

    # Stamp onto league leaderboards (every computed player, qualified or not;
    # pctile will only be meaningful for qualified players).
    enr = 0
    for p in players:
        pid = p.get("id")
        if pid in all_pis:
            result = all_pis[pid]
            p["pis"] = result["pis"]
            if result["min_total"] >= qualify_min:
                p["pis_pctile"] = pctile(result["pis"])
            enr += 1
    with open(lb_path, "w") as f:
        json.dump(lb, f, indent=2)
    print(f"[pis] enriched {enr} players in {lb_path.name}")

    # Stamp onto hawksData
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)
    enr_h = 0
    for player in hawks.get("players", []):
        pid = player.get("id")
        if pid in all_pis:
            result = all_pis[pid]
            player["pis"] = result["pis"]
            if result["min_total"] >= qualify_min:
                player["pis_pctile"] = pctile(result["pis"])
            enr_h += 1
    with open(hawks_path, "w") as f:
        json.dump(hawks, f, indent=2)
    print(f"[pis] enriched {enr_h} Hawks players in {hawks_path.name}")


if __name__ == "__main__":
    run()
