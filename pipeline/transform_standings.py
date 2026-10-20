"""Transform raw standings into east/west arrays for the frontend."""

import json
import shutil
from datetime import date
from pathlib import Path

from nba_api.stats.static import teams

RAW_DIR = Path("data/raw")
from pipeline.config import STANDINGS_FILENAME
OUT_DATA = Path("data") / STANDINGS_FILENAME
OUT_PUBLIC = Path("app/public") / STANDINGS_FILENAME

# Columns we pull from the leaguestandings response.
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


def build_abbr_lookup():
    """Map NBA.com team_id -> abbreviation using the nba_api static list."""
    return {t["id"]: t["abbreviation"] for t in teams.get_teams()}


def transform_standings():
    today = date.today().isoformat()
    raw_path = RAW_DIR / f"standings_{today}.json"

    print(f"Transforming standings for {today}...")

    with open(raw_path) as f:
        raw = json.load(f)

    result_set = raw["resultSets"][0]
    headers = result_set["headers"]
    rows = result_set["rowSet"]

    # Index of each header we care about.
    idx = {h: headers.index(h) for h in FIELDS.keys()}
    abbr_lookup = build_abbr_lookup()

    east = []
    west = []
    for row in rows:
        team = {out_key: row[idx[in_key]] for in_key, out_key in FIELDS.items()}
        team["abbr"] = abbr_lookup.get(team["team_id"], "")
        team["name"] = f"{team['team_city']} {team['team_name']}"
        # Clean up: drop the two raw name parts, we have the combined name.
        del team["team_city"]
        del team["team_name"]
        if team["conference"] == "East":
            east.append(team)
        else:
            west.append(team)

    # Sort by conference rank (1 = top seed).
    east.sort(key=lambda t: t["conf_rank"])
    west.sort(key=lambda t: t["conf_rank"])

    output = {
        "season": raw.get("parameters", {}).get("Season", ""),
        "updated": today,
        "east": east,
        "west": west,
    }

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_DATA, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Wrote {OUT_DATA}")

    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(OUT_DATA, OUT_PUBLIC)
    print(f"Wrote {OUT_PUBLIC}")

    print("Done.")


if __name__ == "__main__":
    transform_standings()