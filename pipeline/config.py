"""
Configuration for the Hawks data pipeline.

Change SEASON here when the new NBA season starts.
Add or remove endpoints by editing PLAYER_ENDPOINTS or TEAM_ENDPOINTS below.
"""

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