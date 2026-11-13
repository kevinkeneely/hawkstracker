"""
Fetch every NBA game of the season with final scores, for all 30 teams.

This feeds the rolling team power rating (C1) and any feature that
needs cross-team game-level history. Each regular-season game shows up
twice in LeagueGameFinder (once per team), which is actually what we
want: downstream code can group by team_id to get each team's own
game log without extra joins.

Saves:
  data/raw/<SEASON>/league_team_games_<date>.json
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguegamefinder

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

OUT_DIR = Path("data/raw") / SEASON


def fetch_league_team_games() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    out_path = OUT_DIR / f"league_team_games_{today}.json"

    print(f"[league-team-games] fetching all team games (season={SEASON})…")
    # league_id_nullable="00" = NBA (not G League / WNBA).
    # season_type_nullable="Regular Season" excludes preseason/playoffs.
    endpoint = fetch_with_retries(
        leaguegamefinder.LeagueGameFinder,
        season_nullable=SEASON,
        season_type_nullable="Regular Season",
        league_id_nullable="00",
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())
    rows = len(data["resultSets"][0]["rowSet"])

    out_path.write_text(json.dumps(data))
    print(f"[league-team-games] wrote {out_path} ({rows} team-game rows)")
    return rows


if __name__ == "__main__":
    fetch_league_team_games()
