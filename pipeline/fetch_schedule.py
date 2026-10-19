"""
Fetch Hawks completed games via nba_api's LeagueGameLog endpoint.

NBA's CDN and direct stats.nba.com requests get blocked/time out on our
network. nba_api's LeagueGameLog uses stats.nba.com with the right header
set and session handling, same as fetch_league_clutch.py etc.

CAVEAT: Returns only COMPLETED games. Upcoming games are not included.
For season launch, strip starts empty and fills as games are played.

Saves: data/raw/<SEASON>/schedule_<date>.json
"""

import json
from datetime import date
from pathlib import Path

from nba_api.stats.endpoints import leaguegamelog

from pipeline.config import SEASON
from pipeline.fetch import TIMEOUT, fetch_with_retries

HAWKS_TEAM_ID = 1610612737
OUT_DIR = Path("data/raw") / SEASON


def run():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    print(f"[schedule] fetching LeagueGameLog for {SEASON}…")

    endpoint = fetch_with_retries(
        leaguegamelog.LeagueGameLog,
        season=SEASON,
        season_type_all_star="Regular Season",
        timeout=TIMEOUT,
    )
    data = json.loads(endpoint.get_json())

    out_path = OUT_DIR / f"schedule_{today}.json"
    out_path.write_text(json.dumps(data))

    rs = data["resultSets"][0]
    headers = rs["headers"]
    team_id_idx = headers.index("TEAM_ID")
    hawks_rows = [row for row in rs["rowSet"] if row[team_id_idx] == HAWKS_TEAM_ID]
    print(f"[schedule] wrote {out_path} ({len(hawks_rows)} completed Hawks games)")


if __name__ == "__main__":
    run()