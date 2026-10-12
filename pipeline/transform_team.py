"""
Hawks data pipeline — transform raw team endpoint JSON into teamStatsData.json.

Reads today's raw team files from data/raw/<season>/, merges them by TEAM_ID,
picks the fields the dashboard uses, and writes teamStatsData.json to both
data/ and app/public/.

Run from the project root:
    python3 -m pipeline.transform_team
"""

import json
import os
from datetime import date

from nba_api.stats.static import teams as nba_teams

from pipeline.config import SEASON, RAW_DATA_DIR

# Where the final merged file lands
OUT_PATH = "data/teamStatsData.json"

# Also copied here so Vite serves it to the React app in dev,
# and so the Netlify build picks it up when deploying.
APP_OUT_PATH = "app/public/teamStatsData.json"

# Build {team_id: abbreviation} lookup once at module load.
# nba_api ships with static team metadata — no API call needed.
TEAM_ABBREVIATIONS = {t["id"]: t["abbreviation"] for t in nba_teams.get_teams()}

# For each regular team endpoint, which columns to pull and rename to.
# shot_locations endpoints are handled separately (see parse_shot_locations).
TEAM_FIELDS = {
    "team_base": {
        "TEAM_ID": "id",
        "TEAM_NAME": "name",
        "GP": "gp",
        "W": "w",
        "L": "l",
        "W_PCT": "w_pct",
        "W_PCT_RANK": "w_pct_rank",
        "PTS": "pts",
        "PTS_RANK": "pts_rank",
        "FG_PCT": "fg_pct",
        "FG_PCT_RANK": "fg_pct_rank",
        "FG3_PCT": "fg3_pct",
        "FG3_PCT_RANK": "fg3_pct_rank",
        "FT_PCT": "ft_pct",
        "FT_PCT_RANK": "ft_pct_rank",
    },
    "team_advanced": {
        "OFF_RATING": "off_rating",
        "OFF_RATING_RANK": "off_rating_rank",
        "DEF_RATING": "def_rating",
        "DEF_RATING_RANK": "def_rating_rank",
        "NET_RATING": "net_rating",
        "NET_RATING_RANK": "net_rating_rank",
        "TS_PCT": "ts_pct",
        "TS_PCT_RANK": "ts_pct_rank",
        "EFG_PCT": "efg_pct",
        "EFG_PCT_RANK": "efg_pct_rank",
        "PACE": "pace",
        "PACE_RANK": "pace_rank",
        "AST_PCT": "ast_pct",
        "AST_PCT_RANK": "ast_pct_rank",
    },
    "team_four_factors": {
        # Offense
        "FTA_RATE": "fta_rate",
        "FTA_RATE_RANK": "fta_rate_rank",
        "TM_TOV_PCT": "tov_pct",
        "TM_TOV_PCT_RANK": "tov_pct_rank",
        "OREB_PCT": "oreb_pct",
        "OREB_PCT_RANK": "oreb_pct_rank",
        # Defense (opponent perspective)
        "OPP_EFG_PCT": "opp_efg_pct",
        "OPP_EFG_PCT_RANK": "opp_efg_pct_rank",
        "OPP_FTA_RATE": "opp_fta_rate",
        "OPP_FTA_RATE_RANK": "opp_fta_rate_rank",
        "OPP_TOV_PCT": "opp_tov_pct",
        "OPP_TOV_PCT_RANK": "opp_tov_pct_rank",
        "OPP_OREB_PCT": "opp_oreb_pct",
        "OPP_OREB_PCT_RANK": "opp_oreb_pct_rank",
    },
    "team_scoring": {
        "PCT_FGA_3PT": "pct_fga_3pt",
        "PCT_PTS_PAINT": "pct_pts_paint",
        "PCT_PTS_FB": "pct_pts_fb",
        "PCT_PTS_3PT": "pct_pts_3pt",
    },
    "team_misc": {
        "PTS_OFF_TOV": "pts_off_tov",
        "PTS_2ND_CHANCE": "pts_2nd_chance",
        "PTS_FB": "pts_fb",
        "PTS_PAINT": "pts_paint",
    },
    "team_opponent": {
        "OPP_FG_PCT": "opp_fg_pct",
        "OPP_FG3_PCT": "opp_fg3_pct",
        "OPP_FT_PCT": "opp_ft_pct",
        "OPP_PTS": "opp_pts",
        "OPP_AST": "opp_ast",
        "OPP_REB": "opp_reb",
        "OPP_STL": "opp_stl",
        "OPP_BLK": "opp_blk",
    },
}


def load_raw(endpoint_name, season=SEASON, as_of=None):
    """Load today's raw JSON for one endpoint. Returns the parsed dict."""
    if as_of is None:
        as_of = date.today().isoformat()
    filename = f"{endpoint_name}_{as_of}.json"
    path = os.path.join(RAW_DATA_DIR, season, filename)
    with open(path, "r") as f:
        return json.load(f)


def rows_as_dicts(raw):
    """Turn a regular endpoint's resultSets[0] into a list of {col: value} dicts."""
    result_set = raw["resultSets"][0]
    headers = result_set["headers"]
    return [dict(zip(headers, row)) for row in result_set["rowSet"]]


def parse_shot_locations(raw, prefix=""):
    """Extract FG% at Rim, Paint non-RA, and Mid-Range from shot_locations endpoint.

    The endpoint's resultSets is a dict (not a list) with nested shot-zone columns.
    Column layout per team row:
      [0]      TEAM_ID
      [1]      TEAM_NAME
      [2..4]   Restricted Area:      FGM, FGA, FG_PCT
      [5..7]   In The Paint (Non-RA): FGM, FGA, FG_PCT
      [8..10]  Mid-Range:            FGM, FGA, FG_PCT
      [11..13] Left Corner 3
      [14..16] Right Corner 3
      [17..19] Above the Break 3
      [20..22] Backcourt
      [23..25] Corner 3 (aggregated)

    Returns {team_id: {<prefix>rim_fg_pct, <prefix>paint_fg_pct, <prefix>mid_fg_pct}}.
    Pass prefix="opp_" for defensive FG% allowed by zone.
    """
    rows = raw["resultSets"]["rowSet"]
    out = {}
    for row in rows:
        team_id = row[0]
        out[team_id] = {
            f"{prefix}rim_fg_pct": row[4],
            f"{prefix}paint_fg_pct": row[7],
            f"{prefix}mid_fg_pct": row[10],
        }
    return out


def build_teams():
    """Read all raw team endpoints, merge by TEAM_ID, return list of team dicts."""
    # teams maps TEAM_ID → merged team dict
    teams = {}

    # Regular endpoints — follow the TEAM_FIELDS mapping
    for endpoint_name, field_map in TEAM_FIELDS.items():
        raw = load_raw(endpoint_name)
        for row in rows_as_dicts(raw):
            team_id = row["TEAM_ID"]
            if team_id not in teams:
                teams[team_id] = {}
            for source_col, output_field in field_map.items():
                if source_col in row:
                    teams[team_id][output_field] = row[source_col]

    # Add abbreviation from static lookup (not in leaguedashteamstats response)
    for team_id, team in teams.items():
        team["abbr"] = TEAM_ABBREVIATIONS.get(team_id, "")

    # Shot location endpoints — custom parse, merged into existing team dicts
    shot_off = parse_shot_locations(load_raw("team_shot_locations"), prefix="")
    for team_id, fields in shot_off.items():
        if team_id in teams:
            teams[team_id].update(fields)

    shot_def = parse_shot_locations(load_raw("team_shot_locations_opp"), prefix="opp_")
    for team_id, fields in shot_def.items():
        if team_id in teams:
            teams[team_id].update(fields)

    # Return as a list, sorted by win percentage (best record first)
    return sorted(teams.values(), key=lambda t: t.get("w_pct", 0), reverse=True)


def run():
    """Build the merged team data and write it to disk."""
    print(f"Transforming raw team data for {SEASON}")

    teams = build_teams()
    # 6 regular endpoints + 2 shot_locations = 8
    endpoints_count = len(TEAM_FIELDS) + 2
    print(f"  merged {len(teams)} teams across {endpoints_count} endpoints")

    output = {
        "season": SEASON,
        "updated": date.today().isoformat(),
        "teams": teams,
    }

    for path in (OUT_PATH, APP_OUT_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"  wrote {path}")

    print("Done.")


if __name__ == "__main__":
    run()