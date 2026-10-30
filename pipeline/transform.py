"""
Hawks data pipeline — transform raw endpoint JSON into UI-ready hawksData.json.

Reads today's raw files from data/raw/<season>/, merges them by PLAYER_ID,
picks the fields the dashboard uses, and writes data/hawksData.json.

Run from the project root:
    python3 -m pipeline.transform

IMPORTANT — enrichment chain:
This script writes hawksData-<SEASON>.json from scratch, OVERWRITING anything
already in it. Several later transforms add nested blocks to that file
in-place and MUST run after this one to restore full data. Order matters —
the daily-refresh.sh script does the full sequence:

    transform.py                  → writes hawksData-<SEASON>.json (base)
    transform_hustle.py           → adds player.hustle
    transform_clutch.py           → adds player.clutch
    transform_defensive_rates.py  → adds player.stl_pct / blk_pct + league_medians
    transform_shots.py            → writes per-player shots/<id>.json (independent file)
    transform_shot_zones.py       → adds player.zones (reads per-player shots)

If you run transform.py manually without the rest, the shot chart heat map
will lose its zone FG% overlays, the Hustle and Clutch tabs will go empty,
and the Defense chart will lose stl_pct/blk_pct until the next 2 AM cron.
To re-run safely, invoke scripts/daily-refresh.sh or run the chain above
in order.
"""

import json
import os
from datetime import date

from pipeline.config import SEASON, RAW_DATA_DIR, HAWKS_DATA_FILENAME

# Where the final merged file lands (read by the React app)
OUT_PATH = f"data/{HAWKS_DATA_FILENAME}"

# Also copied here so Vite serves it to the React app in dev,
# and so the Netlify build picks it up when deploying.
APP_OUT_PATH = f"app/public/{HAWKS_DATA_FILENAME}"

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
        "AST_PCT": "ast_pct",
        "TM_TOV_PCT": "tov_pct",
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
    "totals": {
        "MIN": "min_total",
        "PTS": "pts_total",
        "REB": "reb_total",
        "AST": "ast_total",
        "STL": "stl_total",
        "BLK": "blk_total",
        "TOV": "tov_total",
        "FGM": "fgm_total",
        "FGA": "fga_total",
        "FG3M": "fg3m_total",
        "FTM": "ftm_total",
        "FTA": "fta_total",
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

# Fields to compute percentile rankings for (vs. all NBA players).
# Maps Hawks field name → source column in league_base raw data.
PCTILE_STATS = {
    "ppg": "PTS",
    "rpg": "REB",
    "apg": "AST",
    "spg": "STL",
    "bpg": "BLK",
    "tov": "TOV",
    "fg_pct": "FG_PCT",
    "fg3_pct": "FG3_PCT",
    "ft_pct": "FT_PCT",
}

# Advanced-measure percentile fields. Source column lives in league_advanced,
# NOT league_base, so computed separately. tov_pct is normalized to 0–1 in
# build_players() to match the other _pct conventions; its league pool values
# are rescaled to match before comparison.
PCTILE_STATS_ADV = {
    "ast_pct": "AST_PCT",
    "tov_pct": "TM_TOV_PCT",
}

# Minimum total minutes played (mpg * gp) for a player to be "qualified".
# Below this threshold, UI greys out the cells to signal small sample size.
MIN_PLAYED_THRESHOLD = 150

# Counting stats that convert meaningfully to Per 36. Percentages don't change.
PER_36_STATS = ["ppg", "rpg", "apg", "spg", "bpg", "tov"]

def load_raw(endpoint_name, season=SEASON, as_of=None):
    """Load a raw JSON file for one endpoint. Returns the parsed dict.

    If `as_of` (YYYY-MM-DD) is given, use that exact date's file. Otherwise
    pick the newest file on disk matching `{endpoint_name}_*.json`. The
    newest-file fallback lets manual re-runs tolerate stale data (e.g.
    running transform before a fresh fetch); the daily cron is unaffected
    since it always fetches before transforming.
    """
    from pathlib import Path as _Path
    if as_of is not None:
        path = os.path.join(RAW_DATA_DIR, season, f"{endpoint_name}_{as_of}.json")
    else:
        files = sorted(_Path(RAW_DATA_DIR, season).glob(f"{endpoint_name}_*.json"))
        if not files:
            raise FileNotFoundError(
                f"No {endpoint_name}_*.json files in {RAW_DATA_DIR}/{season} "
                f"— run `python3 -m pipeline.fetch` first."
            )
        path = str(files[-1])
    with open(path, "r") as f:
        return json.load(f)


def rows_as_dicts(raw):
    """Turn an endpoint's resultSet into a list of {column_name: value} dicts."""
    result_set = raw["resultSets"][0]
    headers = result_set["headers"]
    return [dict(zip(headers, row)) for row in result_set["rowSet"]]

def compute_percentiles(hawks_players):
    """Add percentile and Per 36 fields to each Hawks player, plus 'qualified' bool.

    Per-game percentiles (ppg_pctile, etc.) are vs. all NBA players.
    Per-36 values (ppg_p36, etc.) and their percentiles are computed by
    scaling each counting stat by 36 / mpg, with the comparison pool being
    the same scaling applied to every league player.
    qualified = total minutes played (mpg * gp) >= MIN_PLAYED_THRESHOLD.

    Returns a dict of league medians per PCTILE field, suitable for crosshairs
    on the Charts tab. Keyed by our Hawks field names.
    """
    league = rows_as_dicts(load_raw("league_base"))
    league_adv = rows_as_dicts(load_raw("league_advanced"))

    # Per-game league values per stat (non-null only).
    league_values_pg = {}
    for hawks_field, league_col in PCTILE_STATS.items():
        league_values_pg[hawks_field] = [
            row[league_col] for row in league if row.get(league_col) is not None
        ]

    # Advanced-measure pools. TM_TOV_PCT comes from the API as a percent number
    # (11.1), so divide by 100 to match our normalized Hawks tov_pct (0.111).
    # AST_PCT already arrives as a decimal (0.325) and needs no rescaling.
    for hawks_field, league_col in PCTILE_STATS_ADV.items():
        values = [
            row[league_col] for row in league_adv if row.get(league_col) is not None
        ]
        if hawks_field == "tov_pct":
            values = [v / 100 for v in values]
        league_values_pg[hawks_field] = values

    # Per-36 league values for counting stats (val * 36 / mpg).
    league_values_p36 = {}
    for hawks_field in PER_36_STATS:
        league_col = PCTILE_STATS[hawks_field]
        values = []
        for row in league:
            val = row.get(league_col)
            mpg = row.get("MIN")
            if val is None or not mpg:
                continue
            values.append(val * 36 / mpg)
        league_values_p36[hawks_field] = values

    for player in hawks_players:
        mpg = player.get("mpg") or 0
        gp = player.get("gp") or 0
        player["qualified"] = (mpg * gp) >= MIN_PLAYED_THRESHOLD

        # Per-game percentiles for every PCTILE_STATS and PCTILE_STATS_ADV field.
        for hawks_field in list(PCTILE_STATS) + list(PCTILE_STATS_ADV):
            value = player.get(hawks_field)
            values = league_values_pg[hawks_field]
            if value is None or not values:
                player[f"{hawks_field}_pctile"] = None
                continue
            below = sum(1 for v in values if v < value)
            player[f"{hawks_field}_pctile"] = below / len(values)

        # Per-36 values + percentiles for counting stats.
        for hawks_field in PER_36_STATS:
            value = player.get(hawks_field)
            if value is None or not mpg:
                player[f"{hawks_field}_p36"] = None
                player[f"{hawks_field}_p36_pctile"] = None
                continue
            value_p36 = value * 36 / mpg
            player[f"{hawks_field}_p36"] = value_p36
            values_p36 = league_values_p36[hawks_field]
            if not values_p36:
                player[f"{hawks_field}_p36_pctile"] = None
                continue
            below = sum(1 for v in values_p36 if v < value_p36)
            player[f"{hawks_field}_p36_pctile"] = below / len(values_p36)

    # League medians per field — used by the Charts tab crosshair so dashed
    # lines read as the league midpoint (stable even with 1 Hawks game played)
    # instead of a tiny Hawks sample.
    league_medians = {}
    def _median(vals):
        s = sorted(v for v in vals if v is not None)
        if not s: return None
        mid = len(s) // 2
        return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2
    for field in list(PCTILE_STATS) + list(PCTILE_STATS_ADV):
        league_medians[field] = _median(league_values_pg[field])
    return league_medians

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

    # Merge POSITION from team_roster (not returned by leaguedashplayerstats)
    roster = rows_as_dicts(load_raw("team_roster"))
    pos_by_id = {row["PLAYER_ID"]: row.get("POSITION") for row in roster}
    for player_id, player in players.items():
        player["pos"] = pos_by_id.get(player_id)

    # Normalize NBA.com API quirk: AST_PCT/USG_PCT come as decimals (0.325) but
    # TM_TOV_PCT comes as a percent number (11.1). Rescale tov_pct to a decimal
    # so every "_pct" field in hawksData.json follows the same 0–1 convention.
    for player in players.values():
        if player.get("tov_pct") is not None:
            player["tov_pct"] = player["tov_pct"] / 100

    # Return as a list, sorted by minutes per game (descending) for display order
    return sorted(players.values(), key=lambda p: p.get("mpg", 0), reverse=True)


def run():
    """Build the merged player data and write it to disk."""
    print(f"Transforming raw data for {SEASON}")

    players = build_players()
    print(f"  merged {len(players)} players across {len(FIELDS)} endpoints")
    league_medians = compute_percentiles(players)
    print(f"  computed percentiles vs. league ({len(league_medians)} medians)")

    output = {
        "season": SEASON,
        "updated": date.today().isoformat(),
        "players": players,
        "league_medians": league_medians,
    }

    for path in (OUT_PATH, APP_OUT_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(output, f, indent=2)
        print(f"  wrote {path}")

    print("Done.")


if __name__ == "__main__":
    run()