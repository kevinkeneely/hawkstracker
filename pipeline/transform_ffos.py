"""
Compute FFOS — Four Factors Offensive Score — for every NBA player and
merge onto hawksData + the league leaderboards.

A hawkstracker-original metric (Nov 24, 2026). Reweighted Dean Oliver's
Four Factors for the modern game, plus a defensive possession-creation
factor to credit the Dyson Daniels archetype of players whose value shows
up in possession creation rather than box-score efficiency. See
claude/advanced-metrics-plan.md section "Hawks-tracker-original metrics"
for the design rationale.

Formula:
  eFG%         30%   (higher better)
  OReb (p/36)  25%   (higher better; per-36 as OReb% proxy — we don't
                      have full OReb% from team possessions)
  TOV%         20%   (lower better — INVERTED before weighting)
  Forced TOV   15%   (NEW — composite rate of STL + DEFLECTIONS +
                      CHARGES per 36 min; defensive possession creation)
  FTr          10%   (higher better; computed from fta_total / fga_total)

Each factor → league-wide percentile (0-1) among players who qualify (same
prorated MIN threshold transform_per.py uses, so FFOS and PER share a
pool). Weighted sum × 100 is the FFOS score (0-100, league avg ~50 by
construction). We also pctile-rank the composite itself so the PctileBar
component can render it next to PER, FFOS value plus `ffos_pctile` where
ffos_pctile is "fraction of qualified players with a LOWER FFOS."

Reads+writes:
  app/public/hawksData-<SEASON>.json         (adds player.ffos + .ffos_pctile)
  app/public/league_leaderboards-<SEASON>.json (same)

Must run AFTER transform.py, transform_hustle, transform_league_leaderboards.
"""

import json
from pathlib import Path
from pipeline.config import SEASON, HAWKS_DATA_FILENAME

# Weights per the Nov 24 brainstorm — starting values; tune after a few
# weeks of real games (per forecasting-principles lesson 4). Summing to 1.0
# makes the final `ffos` score read as "0-100".
WEIGHTS = {
    "efg":         0.30,
    "oreb":        0.25,
    "tov":         0.20,  # inverted at compute time
    "forced_tov":  0.15,
    "ftr":         0.10,
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "FFOS weights must sum to 1.0"


def _extract_factors(player):
    """Pull the five factor raw values off one league_leaderboards player.
    Returns None if the player is missing a required field, so they fall
    out of the pool rather than skewing it with zeros."""
    overall = player.get("overall") or {}
    defense = player.get("defense") or {}
    hustle  = player.get("hustle")  or {}

    efg = overall.get("efg_pct")
    tov = overall.get("tov_pct")
    orpg = defense.get("orpg")      # offensive rebounds per game
    spg  = defense.get("spg")       # steals per game
    deflections_p36 = hustle.get("deflections")   # already per 36
    charges_p36     = hustle.get("charges_drawn") # already per 36

    fta = overall.get("fta_total")
    fga = overall.get("fga_total")
    mpg = overall.get("mpg")

    # Reject if any required raw is missing — we won't guess.
    required = [efg, tov, orpg, spg, deflections_p36, charges_p36, fta, fga, mpg]
    if any(v is None for v in required) or fga == 0 or mpg == 0:
        return None

    # FTr = free-throw-attempt rate (FTA per FGA).
    ftr = fta / fga

    # Convert per-game stats to per-36 so the forced-TOV composite is on one basis.
    # mpg is minutes-per-game; dividing gives per-minute, ×36 gives per-36.
    per_36 = lambda per_game: per_game * 36.0 / mpg
    orpg_p36 = per_36(orpg)
    stl_p36  = per_36(spg)
    forced_tov_p36 = stl_p36 + deflections_p36 + charges_p36

    return {
        "efg": efg,
        "oreb": orpg_p36,
        "tov": tov,
        "forced_tov": forced_tov_p36,
        "ftr": ftr,
        "min_total": overall.get("min_total") or 0,
    }


def _pctile_fn(values):
    """Return a function mapping a value to its percentile (0-1) in `values`.
    bisect_left gives the count of strictly-lower values — so a player tied
    with the minimum gets 0, the top value gets just under 1.0."""
    import bisect
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    def _pctile(v, invert=False):
        if n == 0 or v is None:
            return None
        rank = bisect.bisect_left(sorted_vals, v)
        p = rank / n
        return round(1 - p, 4) if invert else round(p, 4)
    return _pctile


def _compute_ffos_for_pool(pool):
    """Given a list of factor-dicts (from _extract_factors), compute FFOS
    for each. Returns parallel list of (ffos_score, ffos_pctile) tuples,
    aligned with `pool`'s order."""
    # Per-factor pctile pools (same players for all factors — the pool).
    efg_pctile  = _pctile_fn([p["efg"]        for p in pool])
    oreb_pctile = _pctile_fn([p["oreb"]       for p in pool])
    tov_pctile  = _pctile_fn([p["tov"]        for p in pool])
    ftov_pctile = _pctile_fn([p["forced_tov"] for p in pool])
    ftr_pctile  = _pctile_fn([p["ftr"]        for p in pool])

    ffos_scores = []
    for p in pool:
        # Each factor → pctile in [0,1]. TOV% inverted (lower is better).
        f_efg  = efg_pctile(p["efg"])
        f_oreb = oreb_pctile(p["oreb"])
        f_tov  = tov_pctile(p["tov"], invert=True)
        f_ftov = ftov_pctile(p["forced_tov"])
        f_ftr  = ftr_pctile(p["ftr"])
        # Weighted sum × 100 → FFOS on a 0-100 scale.
        score = 100.0 * (
            WEIGHTS["efg"]        * f_efg
            + WEIGHTS["oreb"]       * f_oreb
            + WEIGHTS["tov"]        * f_tov
            + WEIGHTS["forced_tov"] * f_ftov
            + WEIGHTS["ftr"]        * f_ftr
        )
        ffos_scores.append(round(score, 2))

    # Now pctile-rank the FFOS scores themselves so the PctileBar can color
    # the row (needs a true "fraction of qualified players with lower FFOS").
    ffos_pctile_fn = _pctile_fn(ffos_scores)
    return [(s, ffos_pctile_fn(s)) for s in ffos_scores]


def run():
    lb_path = Path("app/public") / f"league_leaderboards-{SEASON}.json"
    with open(lb_path) as f:
        lb = json.load(f)
    players = lb.get("players", [])

    # Same prorated qualifier transform_per.py uses — keeps FFOS and PER
    # pctile pools comparable. Floor of 50 handles opening weekend.
    games_elapsed = max((p.get("gp") or 0) for p in players)
    qualify_min = max(50, round(500 * games_elapsed / 82))

    # Build (pid, factors) list for every player who has usable data AND
    # clears the qualifier. The qualifier is enforced on `min_total` because
    # the same floor is applied by PER.
    pool_pairs = []
    for p in players:
        f = _extract_factors(p)
        if f is None:
            continue
        if (f["min_total"] or 0) < qualify_min:
            continue
        pool_pairs.append((p.get("id"), f))

    pool = [f for _, f in pool_pairs]
    print(f"[ffos] pool size: {len(pool)} players "
          f"(qualifier: MIN >= {qualify_min} at {games_elapsed} games elapsed)")

    ffos_results = _compute_ffos_for_pool(pool)
    ffos_by_pid = {pid: {"ffos": s, "ffos_pctile": p}
                   for (pid, _), (s, p) in zip(pool_pairs, ffos_results)}

    # Stamp onto league_leaderboards
    enr = 0
    for p in players:
        pid = p.get("id")
        if pid in ffos_by_pid:
            p["ffos"] = ffos_by_pid[pid]["ffos"]
            p["ffos_pctile"] = ffos_by_pid[pid]["ffos_pctile"]
            enr += 1
    with open(lb_path, "w") as f:
        json.dump(lb, f, indent=2)
    print(f"[ffos] enriched {enr} players in {lb_path.name}")

    # Stamp onto hawksData
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)
    enr_h = 0
    for player in hawks.get("players", []):
        pid = player.get("id")
        if pid in ffos_by_pid:
            player["ffos"] = ffos_by_pid[pid]["ffos"]
            player["ffos_pctile"] = ffos_by_pid[pid]["ffos_pctile"]
            enr_h += 1
    with open(hawks_path, "w") as f:
        json.dump(hawks, f, indent=2)
    print(f"[ffos] enriched {enr_h} Hawks players in {hawks_path.name}")


if __name__ == "__main__":
    run()
