"""
Probe the five tracking endpoints we need for Phase 1.

For each endpoint:
  - Call it with sensible defaults
  - Print the first result set's headers (so we see what fields exist)
  - Print the first player's row (so we see what the data looks like)
  - Print how many players came back

Run this with the project venv active and from the hawkstracker directory:
  cd ~/Projects/hawkstracker
  python3 /tmp/probe_endpoints.py
"""

import json
from nba_api.stats.endpoints import (
    leaguedashptstats,
    leaguedashplayerptshot,
    leaguedashptdefend,
)

SEASON = "2026-27"

PROBES = [
    # (label, endpoint_class, kwargs)
    (
        "DRIVES (playmaking)",
        leaguedashptstats.LeagueDashPtStats,
        dict(season=SEASON, season_type_all_star="Regular Season",
             per_mode_simple="PerGame", pt_measure_type="Drives",
             player_or_team="Player"),
    ),
    (
        "PASSING (playmaking)",
        leaguedashptstats.LeagueDashPtStats,
        dict(season=SEASON, season_type_all_star="Regular Season",
             per_mode_simple="PerGame", pt_measure_type="Passing",
             player_or_team="Player"),
    ),
    (
        "POSSESSIONS / TOUCHES (playmaking)",
        leaguedashptstats.LeagueDashPtStats,
        dict(season=SEASON, season_type_all_star="Regular Season",
             per_mode_simple="PerGame", pt_measure_type="Possessions",
             player_or_team="Player"),
    ),
    (
        "SHOT TYPES (shooting — contested / uncontested / C&S / pull-up)",
        leaguedashplayerptshot.LeagueDashPlayerPtShot,
        dict(season=SEASON, season_type_all_star="Regular Season",
             per_mode_simple="PerGame"),
    ),
    (
        "DEFENSIVE FG% ALLOWED",
        leaguedashptdefend.LeagueDashPtDefend,
        dict(season=SEASON, season_type_all_star="Regular Season",
             per_mode_simple="PerGame", defense_category="Overall"),
    ),
]


def probe(label, cls, kwargs):
    print("=" * 70)
    print(label)
    print("-" * 70)
    try:
        endpoint = cls(timeout=60, **kwargs)
        data = json.loads(endpoint.get_json())
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
        return

    for i, rs in enumerate(data.get("resultSets", [])):
        name = rs.get("name") or f"resultSet[{i}]"
        headers = rs.get("headers", [])
        rows = rs.get("rowSet", [])
        print(f"  [{name}]  {len(headers)} columns, {len(rows)} rows")
        print(f"  Headers: {headers}")
        if rows:
            # Show first row as header:value pairs
            pairs = dict(zip(headers, rows[0]))
            # Trim long names for readability
            short_pairs = {k: v for k, v in pairs.items()
                           if k in ("PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION",
                                    "GP", "MIN")
                           or any(key in k for key in ("DRIVE", "PASS", "TOUCH",
                                                       "CS_", "PU_", "CONTEST", "UNCONT",
                                                       "D_FG", "NORMAL_FG"))}
            print(f"  First row (filtered): {short_pairs}")
        print()


for label, cls, kwargs in PROBES:
    probe(label, cls, kwargs)
