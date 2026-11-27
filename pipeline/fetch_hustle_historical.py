"""
Fetch league-wide per-game Hustle stats for PAST seasons from NBA.com.
Caches to data/raw/historical/<season>/league_hustle.json. Used by the
Career Comparison > Hustle tab.

HARD START DATE: NBA.com started tracking hustle stats in the 2015-16
season. Any requested season before 2015-16 is silently skipped — not
an error, just "no data to fetch." The Hustle tab's frontend treats
missing data for pre-2015-16 seasons as "n/a" (stat didn't exist yet),
not "didn't qualify."

Past-season data is frozen — a season's file never needs refetching
once written — so this script is idempotent.

Usage:
    python3 -m pipeline.fetch_hustle_historical                 # auto-detect
    python3 -m pipeline.fetch_hustle_historical 2022-23
    python3 -m pipeline.fetch_hustle_historical --force 2022-23

Auto-detect mode (no args): walks every current Hawks player's
career.seasons[] array, collects past seasons, filters to >=2015-16.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from requests.exceptions import RequestException
from nba_api.stats.endpoints import leaguehustlestatsplayer

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

RATE_LIMIT_SLEEP = 1.0
TIMEOUT = 90
MAX_RETRIES = 3
RETRY_SLEEP = 10

HISTORICAL_DIR = Path("data/raw/historical")

# NBA.com started tracking hustle in 2015-16. A season ID lexically >=
# "2015-16" is fetchable. Our season IDs are YYYY-YY strings so lex
# comparison works correctly here (2014-15 < 2015-16 < 2016-17 etc.).
HUSTLE_START_SEASON = "2015-16"


def _needed_seasons_from_hawks_data():
    """Walk current Hawks career data for the set of past seasons, filtering
    out anything before 2015-16 (no hustle data available)."""
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)

    seasons = set()
    for player in hawks.get("players", []):
        for s in player.get("career", {}).get("seasons", []):
            sid = s.get("season")
            if sid and sid != SEASON and sid >= HUSTLE_START_SEASON:
                seasons.add(sid)
    return sorted(seasons)


def _file_for(season):
    return HISTORICAL_DIR / season / "league_hustle.json"


def _already_fetched(season):
    fp = _file_for(season)
    if not fp.exists() or fp.stat().st_size == 0:
        return False
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
    """Fetch leaguehustlestatsplayer for one season with retries."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = leaguehustlestatsplayer.LeagueHustleStatsPlayer(
                season=season,
                per_mode_time="PerGame",
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
    raise last_err


def _save(season, data):
    out_path = _file_for(season)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f)
    return out_path.stat().st_size / 1024


def run(seasons=None, force=False):
    """Fetch each requested season. Skips any before HUSTLE_START_SEASON."""
    if seasons is None:
        seasons = _needed_seasons_from_hawks_data()
        print(f"[hustle-historical-fetch] auto-detected {len(seasons)} needed seasons: "
              f"{', '.join(seasons) if seasons else '(none)'}")
    else:
        # Filter out pre-2015-16 seasons and warn
        pre_hustle = [s for s in seasons if s < HUSTLE_START_SEASON]
        seasons = [s for s in seasons if s >= HUSTLE_START_SEASON]
        if pre_hustle:
            print(f"[hustle-historical-fetch] skipping pre-{HUSTLE_START_SEASON} seasons "
                  f"(NBA.com didn't track hustle): {', '.join(pre_hustle)}")

    if not seasons:
        print("[hustle-historical-fetch] nothing to fetch")
        return

    fetched = 0
    skipped = 0
    failed = []
    for i, season in enumerate(seasons):
        if not force and _already_fetched(season):
            print(f"[hustle-historical-fetch] {season}: already cached, skipping")
            skipped += 1
            continue

        print(f"[hustle-historical-fetch] {season}: fetching...")
        try:
            data = _fetch_one(season)
            size_kb = _save(season, data)
            rows = 0
            for rs in data.get("resultSets", []):
                rows = max(rows, len(rs.get("rowSet", [])))
            print(f"[hustle-historical-fetch] {season}: {rows} players, {size_kb:.1f} KB")
            fetched += 1
        except Exception as e:
            print(f"[hustle-historical-fetch] {season}: FAILED — {e}")
            failed.append(season)

        if i < len(seasons) - 1 and not (not force and _already_fetched(seasons[i + 1])):
            time.sleep(RATE_LIMIT_SLEEP)

    print(f"[hustle-historical-fetch] done — fetched {fetched}, skipped {skipped}, "
          f"failed {len(failed)}" + (f" ({', '.join(failed)})" if failed else ""))

    if failed:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch past-season hustle stats for Career Comparison > Hustle tab."
    )
    parser.add_argument("seasons", nargs="*",
        help="Season IDs. Omit to auto-detect from current Hawks career data. "
             f"Seasons before {HUSTLE_START_SEASON} are silently skipped.")
    parser.add_argument("--force", action="store_true",
        help="Refetch even if a cached file already exists.")
    args = parser.parse_args()

    run(seasons=args.seasons if args.seasons else None, force=args.force)


if __name__ == "__main__":
    main()
