#!/bin/zsh
# Daily refresh for hawkstracker — scheduled via launchd at 2 AM ET.
# Fetches NBA.com data, transforms it, commits any changes to main.

set -e  # exit on first error

REPO="/Users/kevinkeneely/Projects/hawkstracker"
cd "$REPO"

echo ""
echo "=========================================="
echo "Daily refresh — $(date)"
echo "=========================================="

# Activate the virtual env so nba_api etc. are available
source .venv/bin/activate

# Run the pipeline
python3 -m pipeline.fetch
python3 -m pipeline.fetch_standings
python3 -m pipeline.transform
python3 -m pipeline.transform_team
python3 -m pipeline.transform_standings
python3 -m pipeline.fetch_shots
python3 -m pipeline.transform_shots
python3 -m pipeline.transform_shot_zones
python3 -m pipeline.fetch_league_shots
python3 -m pipeline.transform_league_baseline
python3 -m pipeline.transform_league_leaderboards
python3 -m pipeline.fetch_hustle
python3 -m pipeline.fetch_league_clutch
python3 -m pipeline.transform_hustle
python3 -m pipeline.transform_clutch
python3 -m pipeline.transform_defensive_rates
python3 -m pipeline.fetch_schedule
python3 -m pipeline.fetch_upcoming
python3 -m pipeline.transform_schedule
python3 -m pipeline.fetch_boxscores

# Commit and push if JSON changed
git add data/*.json app/public/*.json
if git diff --staged --quiet; then
    echo "No data changes today — nothing to commit."
else
    git commit -m "Daily data refresh — $(date -u +%Y-%m-%d)"
    git push
    echo "Pushed to main."
fi

echo "Refresh complete."