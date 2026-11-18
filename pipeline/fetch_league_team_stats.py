"""
Fetch league-wide team Advanced + Four Factors stats for all 30 teams.

This feeds matchup previews (D1) and rolling team power rating (C1).

Captures (Advanced measure):
  Off/Def/Net Rating, Pace, eFG%, TOV%, OReb%, TS%, AST%, DREB%, REB%, PIE
Captures (Four Factors measure):
  FTA_RATE, OPP_FTA_RATE, and friends

Saves:
  data/raw/<SEASON>/league_team_stats_<date>.json       (Advanced)
  data/raw/<SEASON>/league_team_four_factors_<date>.json (Four Factors)
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashteamstats

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def _fetch(measure_type: str, filename: str, per_mode: str = "PerGame") -> int:
    print(f"[league-team-stats] fetching {measure_type} ({per_mode}, season={SEASON})…")
    endpoint = fetch_with_retries(
        leaguedashteamstats.LeagueDashTeamStats,
        measure_type_detailed_defense=measure_type,
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_detailed=per_mode,
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())
    rows = len(data["resultSets"][0]["rowSet"])
    out_path = OUT_DIR / filename
    out_path.write_text(json.dumps(data))
    print(f"[league-team-stats] wrote {out_path} ({rows} teams)")
    return rows


def _fetch_opponent_per100(filename: str) -> int:
    """Opponent measure with Per100Possessions normalization — the scale
    that makes "opponent gave up X" comparable across different paces."""
    return _fetch("Opponent", filename, per_mode="Per100Possessions")


def fetch_league_team_stats() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    _fetch("Advanced",     f"league_team_stats_{today}.json")
    _fetch("Four Factors", f"league_team_four_factors_{today}.json")
    # Opponent measure type: per-100-poss stats OPP_PTS/REB/AST/STL/BLK/TOV
    # + OPP_FG3_PCT. Used by player projections to scale each stat by the
    # specific defensive weakness of the night's opponent (see
    # UpcomingGamePlayerProjections and lib/playerProjections.js).
    _fetch_opponent_per100(f"league_team_opponent_{today}.json")


if __name__ == "__main__":
    fetch_league_team_stats()
