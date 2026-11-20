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
run_step fetch_league_team_stats      python3 -m pipeline.fetch_league_team_stats
run_step fetch_league_team_games      python3 -m pipeline.fetch_league_team_games
run_step transform_league_team_stats  python3 -m pipeline.transform_league_team_stats
run_step transform_league_team_games  python3 -m pipeline.transform_league_team_games
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

# Player career stats (B3 — milestone tracker on the Insights tab). Fetches
# PlayerCareerStats per Hawks player (~14 calls, ~15s). Transform merges
# lifetime totals + per-stat best-season rows into each player's object in
# hawksData under `career`. Must run AFTER transform.py (which writes the
# player list and would otherwise overwrite the enrichment).
run_step fetch_player_career          python3 -m pipeline.fetch_player_career
run_step transform_player_career      python3 -m pipeline.transform_player_career

# Advanced tracking data (Phase 1 of the Advanced Stats plan — see
# claude/advanced-stats-plan.md). Five fetches hit NBA.com tracking
# endpoints, three "transform_tracking_X" transforms publish per-season
# league JSONs under app/public/, three "transform_hawks_X_tracking"
# transforms enrich each Hawks player in hawksData with percentile-ranked
# blocks. Hawks enrichment MUST run after both the league transforms
# AND transform.py (which creates hawksData).
run_step fetch_tracking_drives           python3 -m pipeline.fetch_tracking_drives
run_step fetch_tracking_passing          python3 -m pipeline.fetch_tracking_passing
run_step fetch_tracking_possessions      python3 -m pipeline.fetch_tracking_possessions
run_step fetch_tracking_defense          python3 -m pipeline.fetch_tracking_defense
run_step fetch_tracking_shots            python3 -m pipeline.fetch_tracking_shots
run_step transform_tracking_defense      python3 -m pipeline.transform_tracking_defense
run_step transform_tracking_playmaking   python3 -m pipeline.transform_tracking_playmaking
run_step transform_tracking_shooting     python3 -m pipeline.transform_tracking_shooting
run_step transform_hawks_defense_tracking    python3 -m pipeline.transform_hawks_defense_tracking
run_step transform_hawks_playmaking_tracking python3 -m pipeline.transform_hawks_playmaking_tracking
run_step transform_hawks_shooting_tracking   python3 -m pipeline.transform_hawks_shooting_tracking

run_step fetch_schedule               python3 -m pipeline.fetch_schedule
run_step fetch_upcoming               python3 -m pipeline.fetch_upcoming
run_step transform_schedule           python3 -m pipeline.transform_schedule
run_step fetch_boxscores              python3 -m pipeline.fetch_boxscores
run_step fetch_boxscore_hustle        python3 -m pipeline.fetch_boxscore_hustle
run_step fetch_boxscore_defensive     python3 -m pipeline.fetch_boxscore_defensive
run_step fetch_boxscore_player_track  python3 -m pipeline.fetch_boxscore_player_track
run_step fetch_boxscore_scoring       python3 -m pipeline.fetch_boxscore_scoring
run_step fetch_boxscore_advanced      python3 -m pipeline.fetch_boxscore_advanced

# Transform per-game box scores into the game_logs JSON the Trends tab and
# Form Watch read. Runs after all fetch_boxscore_* steps so every column
# (traditional + advanced) is available for the newest games.
run_step transform_game_logs          python3 -m pipeline.transform_game_logs

# Lineups tab feeds — four lineup sizes + on/off. Each call hits NBA.com
# directly (no separate fetch step) and writes both a dated snapshot and
# a stable latest-<N>man.json / latest-onoff.json the frontend reads.
run_step transform_lineups_5          python3 -c "from pipeline.transform_lineups import run; run(5)"
run_step transform_lineups_4          python3 -c "from pipeline.transform_lineups import run; run(4)"
run_step transform_lineups_3          python3 -c "from pipeline.transform_lineups import run; run(3)"
run_step transform_lineups_2          python3 -c "from pipeline.transform_lineups import run; run(2)"
run_step transform_onoff              python3 -m pipeline.transform_onoff

# NBA official injury report PDF — parsed into injuries-<season>.json so
# the frontend can show a 🏥 next to inactive players' names on their
# profile. Runs after transform.py (which writes hawksData — our source
# of player-id-by-name) so the lookup is against today's roster.
run_step fetch_injury_report          python3 -m pipeline.fetch_injury_report

# Replays the player-projection model across every completed Hawks game
# this season and writes projection_backtest-<season>.json with per-stat
# mean absolute errors. Runs in Node, imports the frontend's projection
# lib directly so the MAE is for THE model the user sees. See the script
# for scope + methodology.
run_step backtest_projections         node pipeline/backtest_player_projections.mjs

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
    # AM/PM tag so AM vs PM runs are distinguishable in git log. Based on
    # local time (not UTC) so the label matches the slot the cron fires in.
    # Added Nov 19: pipeline now runs twice daily — 2 AM ET to catch the
    # overnight picture, 12:30 PM ET to catch late-arriving NBA.com stat
    # corrections + box-score advanced/tracking data that often isn't fully
    # cooked at 2 AM (especially after late West Coast games).
    if [ $(date +%H) -lt 12 ]; then SLOT=AM; else SLOT=PM; fi

    if [ -n "$commit_tag" ]; then
        git commit -m "Daily data refresh — $(date -u +%Y-%m-%d) ${SLOT} [$commit_tag]"
    else
        git commit -m "Daily data refresh — $(date -u +%Y-%m-%d) ${SLOT}"
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
