"""
Compute TWI+ (Two-Way Impact Plus) — the third hawkstracker-original
player metric (Nov 26, 2026). Direction 3 from the Nov 24 brainstorm.

Unlike PER/FFOS/PIS which are each a single "axis" of player value,
TWI+ is a SYNERGY metric — it rewards players who are strong on BOTH
shooting efficiency AND possession creation at the same time. A pure
shooter or a pure possession-creator scores near league average;
players who compound value across both axes score high.

Name follows the wRC+ convention from baseball sabermetrics — the "+"
means "100 = league average, 150 = 50% above, 50 = 50% below." Reads
the same way visitors from sabermetrics-adjacent spaces will expect.

FORMULA (v1, Nov 26 — may tune after real-game data):

    TWI+ = (player_TS% / league_avg_TS%)
         × (player_PIS / league_avg_PIS)
         × 100

Both inputs are rate stats already on comparable scales: TS% is pure
shooting efficiency (0.56 league avg), PIS is pure possession
creation (~8.4 league avg among qualified players). Multiplying their
ratios gives a compound score where league-average-on-both = 100,
and the product captures the "both axes together" signal addition
would miss.

INPUT CHOICE (per Nov 26 brainstorm, Option B):
  - TS%  : pure shooting efficiency, no overlap with possession
  - PIS  : hawkstracker's existing possession-rate metric
  Using FFOS instead of PIS would double-count possession
  signal (FFOS has OReb + Forced TOV), so TS% × PIS is the
  cleanest "orthogonal axes" multiplication.

FUTURE WORK (noted for later, Option C from brainstorm):
  Build a separate possession-rate input from scratch (OReb + DReb +
  STL + Deflections per 36, no TOV penalty) and multiply that with
  TS% directly, rather than reusing PIS. More symmetric (both inputs
  would be raw rates vs. league averages), but requires another
  transform step. For now PIS does the job.

QUALIFIER:
  Same prorated MIN threshold transform_per/ffos/pis use, so TWI+
  shares the exact same pctile pool as the other three. Players below
  the threshold get a TWI+ value but no pctile.

Reads+writes:
  app/public/hawksData-<SEASON>.json          (adds player.twi_plus + .twi_plus_pctile)
  app/public/league_leaderboards-<SEASON>.json (same)

Must run AFTER transform_pis (depends on PIS already being written).
"""

import json
import bisect
from pathlib import Path
from pipeline.config import SEASON, HAWKS_DATA_FILENAME


def run():
    lb_path = Path("app/public") / f"league_leaderboards-{SEASON}.json"
    with open(lb_path) as f:
        lb = json.load(f)
    players = lb.get("players", [])

    games_elapsed = max((p.get("gp") or 0) for p in players)
    qualify_min = max(50, round(500 * games_elapsed / 82))

    # Compute league averages for TS% and PIS from the qualified pool only.
    # Using qualified averages (not raw league means) because unqualified
    # players have small-sample noise that would skew the denominator.
    qual_ts   = []
    qual_pis  = []
    for p in players:
        ts = (p.get("overall") or {}).get("ts_pct")
        pis = p.get("pis")
        min_total = (p.get("overall") or {}).get("min_total") or 0
        if ts is None or pis is None:
            continue
        if min_total < qualify_min:
            continue
        qual_ts.append(ts)
        qual_pis.append(pis)

    if not qual_ts or not qual_pis:
        print("[twi] no qualified players, nothing to compute")
        return

    lg_ts_avg  = sum(qual_ts)  / len(qual_ts)
    lg_pis_avg = sum(qual_pis) / len(qual_pis)
    print(f"[twi] league averages (qualified pool): "
          f"TS%={lg_ts_avg:.4f}  PIS={lg_pis_avg:.2f}  (n={len(qual_ts)})")

    # Guard against zero/negative denominators (shouldn't happen with the
    # qualified pool but defensive).
    if lg_ts_avg <= 0 or lg_pis_avg <= 0:
        print("[twi] league avg is non-positive — aborting")
        return

    # Compute TWI+ for every player (qualified or not). Pctile only for
    # qualified players, same pattern as PIS.
    twi_by_pid = {}
    for p in players:
        pid = p.get("id")
        ts = (p.get("overall") or {}).get("ts_pct")
        pis = p.get("pis")
        if ts is None or pis is None:
            continue
        twi_plus = (ts / lg_ts_avg) * (pis / lg_pis_avg) * 100
        twi_by_pid[pid] = {
            "twi_plus": round(twi_plus, 2),
            "min_total": (p.get("overall") or {}).get("min_total") or 0,
        }

    # Build qualified pool pctile from TWI+ scores.
    qualified_scores = sorted(
        v["twi_plus"] for v in twi_by_pid.values() if v["min_total"] >= qualify_min
    )
    n = len(qualified_scores)
    print(f"[twi] pool size for pctile: {n} players "
          f"(qualifier: MIN >= {qualify_min} at {games_elapsed} games elapsed)")

    def pctile(score):
        if n == 0:
            return None
        rank = bisect.bisect_left(qualified_scores, score)
        return round(rank / n, 4)

    # Stamp onto league leaderboards
    enr = 0
    for p in players:
        pid = p.get("id")
        if pid in twi_by_pid:
            v = twi_by_pid[pid]
            p["twi_plus"] = v["twi_plus"]
            if v["min_total"] >= qualify_min:
                p["twi_plus_pctile"] = pctile(v["twi_plus"])
            enr += 1
    with open(lb_path, "w") as f:
        json.dump(lb, f, indent=2)
    print(f"[twi] enriched {enr} players in {lb_path.name}")

    # Stamp onto hawksData
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)
    enr_h = 0
    for player in hawks.get("players", []):
        pid = player.get("id")
        if pid in twi_by_pid:
            v = twi_by_pid[pid]
            player["twi_plus"] = v["twi_plus"]
            if v["min_total"] >= qualify_min:
                player["twi_plus_pctile"] = pctile(v["twi_plus"])
            enr_h += 1
    with open(hawks_path, "w") as f:
        json.dump(hawks, f, indent=2)
    print(f"[twi] enriched {enr_h} Hawks players in {hawks_path.name}")


if __name__ == "__main__":
    run()
