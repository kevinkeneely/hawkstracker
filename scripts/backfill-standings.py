"""Backfill final regular-season standings for a historical NBA season.

Usage:
    python scripts/backfill-standings.py 2025-26

Fetches the final regular-season standings for the given season from
NBA.com's LeagueStandings endpoint and writes them in the same shape the
overnight pipeline produces, to app/public/standingsData-{season}.json.

Regular season only — SeasonType='Regular Season' means preseason and
playoff games are not included in the W/L record. The 2025-26 Hawks for
example show 46-36 (their regular-season record), not an inflated total
that would include preseason exhibitions or the playoffs.

Use when a historical standings file has been corrupted — typically when
a season flip occurred and the pipeline overwrote the previous season's
snapshot with current-season starting data (0-0 for everyone).
"""

import json
import sys
from pathlib import Path

# Add the project root to the Python path so we can import `pipeline`.
# Needed because this script lives in `scripts/` rather than being invoked
# as a module (`python -m pipeline.X`) like the overnight scripts.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import pipeline.config so NBA.com's header overrides get applied.
from pipeline import config  # noqa: F401

from nba_api.stats.endpoints import leaguestandings
from nba_api.stats.static import teams

HAWKS_TEAM_ID = 1610612737

# Columns we extract from the LeagueStandings response. Keys are NBA.com
# column names; values are the frontend-facing property names.
FIELDS = {
    "TeamID": "team_id",
    "TeamCity": "team_city",
    "TeamName": "team_name",
    "Conference": "conference",
    "PlayoffRank": "conf_rank",
    "WINS": "w",
    "LOSSES": "l",
    "WinPCT": "pct",
    "ConferenceGamesBack": "gb",
    "strCurrentStreak": "streak",
    "HOME": "home_record",
    "ROAD": "road_record",
    "L10": "last_10",
}


def backfill(season):
    print(f"Fetching regular-season standings for {season}...")
    response = leaguestandings.LeagueStandings(
        season=season,
        # Explicit even though it's the default — makes intent obvious.
        season_type="Regular Season",
    )
    raw = response.get_dict()

    result_set = raw["resultSets"][0]
    headers = result_set["headers"]
    rows = result_set["rowSet"]

    idx = {h: headers.index(h) for h in FIELDS}
    abbr_lookup = {t["id"]: t["abbreviation"] for t in teams.get_teams()}

    east, west = [], []
    for row in rows:
        team = {out_key: row[idx[in_key]] for in_key, out_key in FIELDS.items()}
        team["abbr"] = abbr_lookup.get(team["team_id"], "")
        team["name"] = f"{team['team_city']} {team['team_name']}"
        del team["team_city"]
        del team["team_name"]
        (east if team["conference"] == "East" else west).append(team)

    east.sort(key=lambda t: t["conf_rank"])
    west.sort(key=lambda t: t["conf_rank"])

    output = {
        "season": season,
        "updated": f"{season} regular season complete",
        "east": east,
        "west": west,
    }

    out_path = Path(f"app/public/standingsData-{season}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote {out_path}")
    print(f"  East: {len(east)} teams, West: {len(west)} teams")

    hawks = next((t for t in east if t["team_id"] == HAWKS_TEAM_ID), None)
    if hawks:
        print(f"  Hawks: {hawks['w']}-{hawks['l']} "
              f"({hawks['pct']:.3f}), East rank {hawks['conf_rank']}, "
              f"streak {hawks['streak']}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/backfill-standings.py <season>")
        print("Example: python scripts/backfill-standings.py 2025-26")
        sys.exit(1)
    backfill(sys.argv[1])
