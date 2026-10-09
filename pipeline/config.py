"""
Configuration for the Hawks data pipeline.

Change SEASON here when the new NBA season starts.
Add or remove endpoints by editing ENDPOINTS below.
"""

# Atlanta Hawks team ID (NBA.com's internal ID)
ATLANTA_TEAM_ID = 1610612737

# Current season — change this once per year
SEASON = "2025-26"

# Where to save raw API responses
RAW_DATA_DIR = "data/raw"

# Endpoints to pull on each run.
# Each entry: (friendly_name, nba_api_measure_type)
# "friendly_name" is used in filenames.
ENDPOINTS = [
    ("base", "Base"),
    ("advanced", "Advanced"),
    ("scoring", "Scoring"),
    ("misc", "Misc"),
    ("usage", "Usage"),
]