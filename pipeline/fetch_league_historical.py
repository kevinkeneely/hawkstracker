"""
Fetch league-wide per-game Base stats for a PAST season from NBA.com and cache
to data/raw/historical/<season>/league_base.json. Used by the Career Comparison
view (/career/:playerId) to show each season's cell in true league-percentile
color against that season's actual player pool.

Past-season data is frozen — a season's file never needs refetching once
written — so this script is idempotent: if the target file exists AND is
non-empty, we skip the fetch. Pass --force to override.

Usage:
    python3 -m pipeline.fetch_league_historical                # auto-detect from career data
    python3 -m pipeline.fetch_league_historical 2022-23        # one season
    python3 -m pipeline.fetch_league_historical 2022-23 2023-24   # several
    python3 -m pipeline.fetch_league_historical --force 2022-23   # refetch

Auto-detect mode (no args): reads app/public/hawksData-<SEASON>.json, collects
every unique past season across every current Hawks player's career.seasons[]
array, excludes the current SEASON (already covered by the daily pipeline),
and fetches what's missing. New seasons get picked up automatically when we
sign veteran players — no need to re-edit this script.

Not wired into the daily cron (past-season fetches aren't daily work).
Wire into scripts/backfill-career-percentiles.sh instead, which can be
re-run safely after any roster change thanks to the idempotence check.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from requests.exceptions import RequestException
from nba_api.stats.endpoints import leaguedashplayerstats

from pipeline.config import SEASON, RAW_DATA_DIR, HAWKS_DATA_FILENAME

# NBA.com rate limiting — match fetch.py's conservative values.
RATE_LIMIT_SLEEP = 1.0
TIMEOUT = 90
MAX_RETRIES = 3
RETRY_SLEEP = 10

# Historical files live under a separate subtree to visually separate frozen
# past-season data from the daily-refreshed current-season files.
HISTORICAL_DIR = Path("data/raw/historical")


def _needed_seasons_from_hawks_data():
    """Walk current Hawks' career.seasons and return the set of past seasons
    we'd need percentiles for. Excludes the current SEASON (that's covered
    by the daily pipeline)."""
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)

    seasons = set()
    for player in hawks.get("players", []):
        career = player.get("career", {})
        for s in career.get("seasons", []):
            sid = s.get("season")
            if sid and sid != SEASON:
                seasons.add(sid)
    return sorted(seasons)


def _file_for(season):
    """Return the output path for a given season's cached fetch."""
    return HISTORICAL_DIR / season / "league_base.json"


def _already_fetched(season):
    """True iff the season's file exists and is non-empty JSON with rows."""
    fp = _file_for(season)
    if not fp.exists() or fp.stat().st_size == 0:
        return False
    # Guard against a half-written file from a previous interrupted run.
    try:
        with open(fp) as f:
            d = json.load(f)
        for rs in d.get("resultSets", []):
            if rs.get("rowSet"):
                return True
    except (json.JSONDecodeError, OSError):
        return False
    return False


def _fetch_one(season):
    """Fetch leaguedashplayerstats for one season with retries. Returns the
    raw API response dict, or raises after MAX_RETRIES failures."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season,
                per_mode_detailed="PerGame",
                measure_type_detailed_defense="Base",
                timeout=TIMEOUT,
            )
            return result.get_dict()
        except (RequestException, Exception) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                print(f"  [retry] attempt {attempt}/{MAX_RETRIES} failed: {e}")
                time.sleep(RETRY_SLEEP)
            else:
                raise
    raise last_err  # unreachable, but keeps linter happy


def _save(season, data):
    """Write the raw response to data/raw/historical/<season>/league_base.json."""
    out_path = _file_for(season)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f)
    size_kb = out_path.stat().st_size / 1024
    return size_kb


def run(seasons=None, force=False):
    """Fetch each requested season. If seasons is None, auto-detect from
    current Hawks career data."""
    if seasons is None:
        seasons = _needed_seasons_from_hawks_data()
        print(f"[historical-fetch] auto-detected {len(seasons)} needed seasons: "
              f"{', '.join(seasons) if seasons else '(none)'}")

    if not seasons:
        print("[historical-fetch] nothing to fetch")
        return

    fetched = 0
    skipped = 0
    failed = []
    for i, season in enumerate(seasons):
        if not force and _already_fetched(season):
            print(f"[historical-fetch] {season}: already cached, skipping")
            skipped += 1
            continue

        print(f"[historical-fetch] {season}: fetching...")
        try:
            data = _fetch_one(season)
            size_kb = _save(season, data)
            # Count rows for a quick sanity check
            rows = 0
            for rs in data.get("resultSets", []):
                rows = max(rows, len(rs.get("rowSet", [])))
            print(f"[historical-fetch] {season}: {rows} players, {size_kb:.1f} KB")
            fetched += 1
        except Exception as e:
            print(f"[historical-fetch] {season}: FAILED — {e}")
            failed.append(season)

        # Sleep between calls to be polite to NBA.com — but not after the last one
        if i < len(seasons) - 1 and not (not force and _already_fetched(seasons[i + 1])):
            time.sleep(RATE_LIMIT_SLEEP)

    print(f"[historical-fetch] done — fetched {fetched}, skipped {skipped}, "
          f"failed {len(failed)}" + (f" ({', '.join(failed)})" if failed else ""))

    if failed:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch past-season league player stats for Career Comparison percentiles."
    )
    parser.add_argument(
        "seasons", nargs="*",
        help="Season IDs like 2022-23. Omit to auto-detect from current Hawks career data.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Refetch even if a cached file already exists.",
    )
    args = parser.parse_args()

    run(seasons=args.seasons if args.seasons else None, force=args.force)


if __name__ == "__main__":
    main()
