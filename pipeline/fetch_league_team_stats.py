"""
Fetch league-wide team Advanced stats for all 30 teams.

This feeds matchup previews (D1) and rolling team power rating (C1).
Captures Off/Def/Net Rating, Pace, and the Four Factors (eFG%, TOV%,
OReb%, FTr) per team as a season snapshot.

Saves:
  data/raw/<SEASON>/league_team_stats_<date>.json
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguedashteamstats

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def fetch_league_team_stats() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    out_path = OUT_DIR / f"league_team_stats_{today}.json"

    print(f"[league-team-stats] fetching Advanced measure (season={SEASON})…")
    # measure_type_detailed_defense="Advanced" returns NET_RATING, OFF_RATING,
    # DEF_RATING, PACE, EFG_PCT, TM_TOV_PCT, OREB_PCT, FTA_RATE, etc.
    endpoint = fetch_with_retries(
        leaguedashteamstats.LeagueDashTeamStats,
        measure_type_detailed_defense="Advanced",
        season=SEASON,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())
    rows = len(data["resultSets"][0]["rowSet"])

    out_path.write_text(json.dumps(data))
    print(f"[league-team-stats] wrote {out_path} ({rows} teams)")
    return rows


if __name__ == "__main__":
    fetch_league_team_stats()
