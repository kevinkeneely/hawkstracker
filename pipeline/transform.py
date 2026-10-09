"""
Hawks data pipeline — transform raw endpoint JSON into UI-ready hawksData.json.

Reads today's raw files from data/raw/<season>/, merges them by PLAYER_ID,
picks the fields the dashboard uses, and writes data/hawksData.json.

Run from the project root:
    python3 -m pipeline.transform
"""

import json
import os
from datetime import date

from pipeline.config import SEASON, RAW_DATA_DIR

# Where the final merged file lands (read by the React app)
OUT_PATH = "data/hawksData.json"

# For each endpoint, which columns to pull and what to rename them to.
# Format: {endpoint_name: {source_column: output_field}}
FIELDS = {
    "base": {
        "PLAYER_ID": "id",
        "PLAYER_NAME": "name",
        "AGE": "age",
        "GP": "gp",
        "W": "w",
        "L": "l",
        "MIN": "mpg",
        "PTS": "ppg",
        "REB": "rpg",
        "AST": "apg",
        "STL": "spg",
        "BLK": "bpg",
        "TOV": "tov",
        "FG_PCT": "fg_pct",
        "FG3_PCT": "fg3_pct",
        "FT_PCT": "ft_pct",
    },
    "advanced": {
        "OFF_RATING": "off_rating",
        "DEF_RATING": "def_rating",
        "NET_RATING": "net_rating",
        "TS_PCT": "ts_pct",
        "EFG_PCT": "efg_pct",
        "USG_PCT": "usg_pct",
        "PACE": "pace",
        "PIE": "per",
    },
    "scoring": {
        "PCT_FGA_3PT": "pct_fga_3pt",
        "PCT_PTS_PAINT": "pct_pts_paint",
        "PCT_PTS_FB": "pct_pts_fb",
    },
    "misc": {
        "PTS_OFF_TOV": "pts_off_tov",
        "PTS_2ND_CHANCE": "pts_2nd_chance",
        "PTS_FB": "pts_fb",
        "PTS_PAINT": "pts_paint",
    },
    "usage": {
        "PCT_PTS": "pct_team_pts",
        "PCT_REB": "pct_team_reb",
        "PCT_AST": "pct_team_ast",
    },
    "hustle": {
        "CONTESTED_SHOTS": "contested_shots",
        "CONTESTED_SHOTS_2PT": "contested_2pt",
        "CONTESTED_SHOTS_3PT": "contested_3pt",
        "DEFLECTIONS": "deflections",
        "CHARGES_DRAWN": "charges_drawn",
        "SCREEN_ASSISTS": "screen_assists",
        "SCREEN_AST_PTS": "screen_ast_pts",
        "LOOSE_BALLS_RECOVERED": "loose_balls",
        "OFF_BOXOUTS": "off_boxouts",
        "DEF_BOXOUTS": "def_boxouts",
        "BOX_OUTS": "box_outs",
        "BOX_OUT_PLAYER_TEAM_REBS": "box_out_team_rebs",
    },
    "clutch": {
        "GP": "clutch_gp",
        "MIN": "clutch_min",
        "PTS": "clutch_ppg",
        "REB": "clutch_rpg",
        "AST": "clutch_apg",
        "STL": "clutch_spg",
        "BLK": "clutch_bpg",
        "FG_PCT": "clutch_fg_pct",
        "FG3_PCT": "clutch_fg3_pct",
        "FT_PCT": "clutch_ft_pct",
        "EFG_PCT": "clutch_efg_pct",
        "PLUS_MINUS": "clutch_plus_minus",
    },
    "clutch_adv": {
        "TS_PCT": "clutch_ts_pct",
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
    """Turn an endpoint's resultSet into a list of {column_name: value} dicts."""
    result_set = raw["resultSets"][0]
    headers = result_set["headers"]
    return [dict(zip(headers, row)) for row in result_set["rowSet"]]


def build_players():
    """Read all raw endpoints, merge by PLAYER_ID, return list of player dicts."""
    # players maps PLAYER_ID → merged player dict
    players = {}

    for endpoint_name, field_map in FIELDS.items():
        raw = load_raw(endpoint_name)
        for row in rows_as_dicts(raw):
            player_id = row["PLAYER_ID"]
            if player_id not in players:
                players[player_id] = {}
            # Copy over just the columns we care about, with renaming
            for source_col, output_field in field_map.items():
                if source_col in row:
                    players[player_id][output_field] = row[source_col]

    # Return as a list, sorted by minutes per game (descending) for display order
    return sorted(players.values(), key=lambda p: p.get("mpg", 0), reverse=True)


def run():
    """Build the merged player data and write it to disk."""
    print(f"Transforming raw data for {SEASON}")

    players = build_players()
    print(f"  merged {len(players)} players across {len(FIELDS)} endpoints")

    output = {
        "season": SEASON,
        "updated": date.today().isoformat(),
        "players": players,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"  wrote {OUT_PATH}")
    print("Done.")


if __name__ == "__main__":
    run()