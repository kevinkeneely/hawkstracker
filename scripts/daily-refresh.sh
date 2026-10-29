#!/bin/zsh
# Daily refresh for hawkstracker — scheduled via launchd at 2 AM ET.
# Fetches NBA.com data, transforms it, commits any changes to main.
#
# Error handling: we DO NOT use `set -e`. The pipeline has ~20 steps and
# some are independent of others (e.g. box-scores doesn't need league
# shots). A `set -e` chain means one broken step kills everything
# downstream — including the git commit — which bit on Oct 22 when
# transform_shots crashed and the entire day's data went uncommitted.
# Instead, each step runs through `run_step`, which logs failures to a
# FAILED array and keeps going. At the end we commit whatever succeeded
# and print the failure summary, then exit non-zero if anything failed
# so a monitored cron can surface it.

REPO="/Users/kevinkeneely/Projects/hawkstracker"
cd "$REPO" || { echo "FATAL: cannot cd $REPO"; exit 2; }

echo ""
echo "=========================================="
echo "Daily refresh — $(date)"
echo "=========================================="

# Activate the virtual env so nba_api etc. are available
source .venv/bin/activate

# ---- Per-step error handling ----------------------------------------------
FAILED=()

run_step() {
    local name=$1
    shift
    echo ""
    echo ">>> $name"
    if "$@"; then
        echo "    OK"
    else
        echo "    FAILED (exit $?)"
        FAILED+=("$name")
    fi
}

# ---- Pipeline order --------------------------------------------------------
#
# transform.py writes hawksData-<SEASON>.json from scratch; the enrichment
# transforms below it (hustle, clutch, defensive_rates, shot_zones) add
# nested blocks to that file in-place. Running transform.py alone wipes
# those blocks, so the enrichments must come after transform.py. If you
# re-run manually, re-run the full chain in this order.

run_step fetch                        python3 -m pipeline.fetch
run_step fetch_standings              python3 -m pipeline.fetch_standings
run_step transform                    python3 -m pipeline.transform
run_step transform_team               python3 -m pipeline.transform_team
run_step transform_standings          python3 -m pipeline.transform_standings
run_step fetch_shots                  python3 -m pipeline.fetch_shots
run_step transform_shots              python3 -m pipeline.transform_shots
run_step transform_shot_zones         python3 -m pipeline.transform_shot_zones
run_step fetch_league_shots           python3 -m pipeline.fetch_league_shots
run_step transform_league_baseline    python3 -m pipeline.transform_league_baseline
run_step transform_league_leaderboards python3 -m pipeline.transform_league_leaderboards
run_step fetch_hustle                 python3 -m pipeline.fetch_hustle
run_step fetch_league_clutch          python3 -m pipeline.fetch_league_clutch
run_step transform_hustle             python3 -m pipeline.transform_hustle
run_step transform_clutch             python3 -m pipeline.transform_clutch
run_step transform_defensive_rates    python3 -m pipeline.transform_defensive_rates
run_step fetch_schedule               python3 -m pipeline.fetch_schedule
run_step fetch_upcoming               python3 -m pipeline.fetch_upcoming
run_step transform_schedule           python3 -m pipeline.transform_schedule
run_step fetch_boxscores              python3 -m pipeline.fetch_boxscores

# ---- Commit whatever changed ----------------------------------------------
echo ""
echo "=========================================="
if [ ${#FAILED[@]} -gt 0 ]; then
    echo "WARN: ${#FAILED[@]} step(s) failed: ${FAILED[*]}"
    echo "Committing partial data anyway — some data is better than none."
    commit_tag="partial — failed: ${FAILED[*]}"
else
    echo "All steps OK"
    commit_tag=""
fi
echo "=========================================="

git add data app/public
if git diff --staged --quiet; then
    echo "No data changes today — nothing to commit."
else
    if [ -n "$commit_tag" ]; then
        git commit -m "Daily data refresh — $(date -u +%Y-%m-%d) [$commit_tag]"
    else
        git commit -m "Daily data refresh — $(date -u +%Y-%m-%d)"
    fi
    git push
    echo "Pushed to main."
fi

echo "Refresh complete."

# Exit non-zero if any step failed so a monitored cron (launchd stderr,
# future PagerDuty/webhook, etc.) can detect the problem.
if [ ${#FAILED[@]} -gt 0 ]; then
    exit 1
fi
exit 0
