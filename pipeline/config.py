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
SEASON = "2025-26"

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