"""
Configuration for the Hawks data pipeline.

Change SEASON here when the new NBA season starts.
Add or remove endpoints by editing PLAYER_ENDPOINTS or TEAM_ENDPOINTS below.
"""

# ---------------------------------------------------------------------------
# NBA.com API header override — runs on import.
#
# NBA.com throttles or silently drops requests from datacenter IPs
# (e.g. GitHub Actions) that use the default nba_api User-Agent. These
# headers mirror what the real nba.com web app sends, which the server
# accepts without rate-limiting. Must run before any
# `from nba_api.stats.endpoints import ...` statement.
# ---------------------------------------------------------------------------
from nba_api.stats.library.http import NBAStatsHTTP

NBAStatsHTTP.headers.update({
    'Host': 'stats.nba.com',
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/128.0.0.0 Safari/537.36'
    ),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
    'Connection': 'keep-alive',
})

# Atlanta Hawks team ID (NBA.com's internal ID)
ATLANTA_TEAM_ID = 1610612737

# Current season — change this once per year
SEASON = "2026-27"

# Season-suffixed filenames. Every writer and reader in the pipeline uses
# these so each season's data lives in its own file (e.g. hawksData-2026-27.json).
# The frontend's season toggle picks which file to fetch.
HAWKS_DATA_FILENAME    = f"hawksData-{SEASON}.json"
LEADERBOARDS_FILENAME  = f"league_leaderboards-{SEASON}.json"
SCHEDULE_FILENAME      = f"schedule-{SEASON}.json"
SHOT_BASELINE_FILENAME = f"league_shot_baseline-{SEASON}.json"
TEAM_STATS_FILENAME    = f"teamStatsData-{SEASON}.json"
STANDINGS_FILENAME     = f"standingsData-{SEASON}.json"

# Where to save raw API responses
RAW_DATA_DIR = "data/raw"

# Player-level endpoints, filtered to the Hawks roster.
# Each entry: (friendly_name, nba_api_measure_type)
# "friendly_name" is used in filenames.
PLAYER_ENDPOINTS = [
    ("base", "Base"),
    ("advanced", "Advanced"),
    ("scoring", "Scoring"),
    ("misc", "Misc"),
    ("usage", "Usage"),
    ("hustle", None),
    ("clutch", "Base"),
    ("clutch_adv", "Advanced"),
]

# Team-level endpoints, unfiltered so we get all 30 teams.
# Opponent MeasureType gives us the defensive view (opp eFG%, opp OReb%, etc.)
# team_shot_locations_opp uses the shot-locations endpoint with Opponent view
# for defensive FG% by zone.
TEAM_ENDPOINTS = [
    ("team_base", "Base"),
    ("team_advanced", "Advanced"),
    ("team_four_factors", "Four Factors"),
    ("team_scoring", "Scoring"),
    ("team_misc", "Misc"),
    ("team_opponent", "Opponent"),
    ("team_shot_locations", "Base"),
    ("team_shot_locations_opp", "Opponent"),
]


# ---------------------------------------------------------------------------
# Season-guard helper — added Nov 20 for post-launch-followups #12.
#
# Many pipeline transforms take a raw NBA.com API response and merge its
# rows into a season-specific output file (hawksData-<SEASON>.json,
# league_team_stats-<SEASON>.json, etc). The failure mode we're guarding
# against: a stale raw file from LAST season (e.g. 2025-26 left in
# data/raw/2025-26/) silently feeds into this season's transforms during a
# manual re-run, producing a file that LOOKS like 2026-27 data but actually
# holds 2025-26 numbers. Nothing errors; the dashboard just shows the wrong
# season and nobody notices until a human eyeballs it.
#
# This helper reads the NBA.com `parameters.Season` (or `.SeasonYear` for
# some endpoints like hustle) out of a raw response and refuses to continue
# if it doesn't match the current SEASON. Call it at the top of each
# transform's main() AFTER loading the raw JSON and BEFORE writing any
# output.
#
# Returns nothing on match (the caller keeps going). Raises ValueError on
# mismatch so the daily-refresh.sh run_step wrapper logs it as FAILED
# instead of silently committing wrong data.
# ---------------------------------------------------------------------------
def assert_raw_season_matches(raw, source_description, expected_season=None):
    """
    raw                 — a dict parsed from an NBA.com API JSON response.
    source_description  — human-readable name of the file / endpoint for
                          the error message (e.g. "base_2026-10-20.json"
                          or "LeagueStandings endpoint").
    expected_season     — defaults to config.SEASON. Only override if
                          you're processing historical seasons on purpose.
    """
    if expected_season is None:
        expected_season = SEASON

    # Not every endpoint echoes a season param (shot charts, some tracking
    # endpoints). If we can't find one, DON'T fail — just return. Failing
    # closed here would break the handful of endpoints that are safely
    # season-agnostic.
    params = raw.get("parameters") if isinstance(raw, dict) else None
    if not isinstance(params, dict):
        return

    # Most endpoints use "Season". Hustle uses "SeasonYear". Try both.
    season_in_file = params.get("Season") or params.get("SeasonYear")
    if season_in_file is None:
        return

    if season_in_file != expected_season:
        raise ValueError(
            f"Season mismatch in {source_description}: "
            f"raw file says Season={season_in_file!r}, "
            f"but pipeline config SEASON={expected_season!r}. "
            f"Refusing to transform — fix the stale raw file or "
            f"delete it and re-fetch before retrying."
        )
