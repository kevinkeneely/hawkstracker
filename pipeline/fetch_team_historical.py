"""
Fetch league-wide per-game team stats (Base + Opponent) for PAST seasons
from NBA.com. Caches to data/raw/historical/<season>/team_<measure>.json.

Used by the Career Comparison > Advanced tab for computing player STL% /
BLK% percentiles against past-season league pools. The BBR formulas:

    STL% = 100 * (STL * TmMP) / (MP * OppPoss)
    BLK% = 100 * (BLK * TmMP) / (MP * (OppFGA - OppFG3A))

Need TmMP from team_base and OppPoss / OppFGA / OppFG3A from team_opponent
for the player's team in each past season. The league Advanced pool
(from fetch_league_historical.py) doesn't carry these.

Past-season data is frozen — a season's file never needs refetching once
written — so this script is idempotent: if the target file exists AND is
non-empty, we skip the fetch. Pass --force to override.

Usage:
    python3 -m pipeline.fetch_team_historical                        # both measures, auto-detect
    python3 -m pipeline.fetch_team_historical --measure base         # just base
    python3 -m pipeline.fetch_team_historical --measure opponent     # just opponent
    python3 -m pipeline.fetch_team_historical 2022-23                # one season, both measures
    python3 -m pipeline.fetch_team_historical --force 2022-23        # refetch

Auto-detect mode (no seasons given): same as fetch_league_historical —
walks every current Hawks player's career.seasons[] array for the set of
past seasons needed.

Not wired into the daily cron by default (past-season fetches aren't
daily work); daily-refresh.sh includes it as an idempotent safety net
after player_career so a mid-season veteran signing gets his past seasons
automatically.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from requests.exceptions import RequestException
from nba_api.stats.endpoints import leaguedashteamstats

from pipeline.config import SEASON, HAWKS_DATA_FILENAME

RATE_LIMIT_SLEEP = 1.0
TIMEOUT = 90
MAX_RETRIES = 3
RETRY_SLEEP = 10

HISTORICAL_DIR = Path("data/raw/historical")
VALID_MEASURES = ("base", "opponent")


def _needed_seasons_from_hawks_data():
    """Same auto-detect as fetch_league_historical — union of past seasons
    across every current Hawks player's career.seasons[] array."""
    hawks_path = Path("app/public") / HAWKS_DATA_FILENAME
    with open(hawks_path) as f:
        hawks = json.load(f)

    seasons = set()
    for player in hawks.get("players", []):
        for s in player.get("career", {}).get("seasons", []):
            sid = s.get("season")
            if sid and sid != SEASON:
                seasons.add(sid)
    return sorted(seasons)


def _file_for(season, measure):
    return HISTORICAL_DIR / season / f"team_{measure}.json"


def _already_fetched(season, measure):
    fp = _file_for(season, measure)
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


def _fetch_one(season, measure):
    """Fetch leaguedashteamstats for one season+measure with retries.
    NBA.com's parameter wants title-case ('Base' / 'Opponent')."""
    nba_measure = measure.capitalize()  # "base" -> "Base", "opponent" -> "Opponent"
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = leaguedashteamstats.LeagueDashTeamStats(
                season=season,
                per_mode_detailed="PerGame",
                measure_type_detailed_defense=nba_measure,
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


def _save(season, measure, data):
    out_path = _file_for(season, measure)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f)
    return out_path.stat().st_size / 1024


def run(seasons=None, force=False, measures=None):
    """Fetch each requested (season, measure) pair. If measures is None,
    fetch both 'base' and 'opponent'. If seasons is None, auto-detect."""
    if measures is None:
        measures = list(VALID_MEASURES)
    if seasons is None:
        seasons = _needed_seasons_from_hawks_data()
        print(f"[team-historical-fetch] auto-detected {len(seasons)} needed seasons: "
              f"{', '.join(seasons) if seasons else '(none)'}")

    if not seasons:
        print("[team-historical-fetch] nothing to fetch")
        return

    fetched = 0
    skipped = 0
    failed = []
    call_count = 0
    total_calls = len(seasons) * len(measures)

    for season in seasons:
        for measure in measures:
            call_count += 1
            tag = f"team-historical-fetch/{measure}"
            if not force and _already_fetched(season, measure):
                print(f"[{tag}] {season}: already cached, skipping")
                skipped += 1
                continue

            print(f"[{tag}] {season}: fetching...")
            try:
                data = _fetch_one(season, measure)
                size_kb = _save(season, measure, data)
                rows = 0
                for rs in data.get("resultSets", []):
                    rows = max(rows, len(rs.get("rowSet", [])))
                print(f"[{tag}] {season}: {rows} teams, {size_kb:.1f} KB")
                fetched += 1
            except Exception as e:
                print(f"[{tag}] {season}: FAILED — {e}")
                failed.append(f"{season}/{measure}")

            # Sleep between calls, but not after the last one
            if call_count < total_calls:
                time.sleep(RATE_LIMIT_SLEEP)

    print(f"[team-historical-fetch] done — fetched {fetched}, skipped {skipped}, "
          f"failed {len(failed)}" + (f" ({', '.join(failed)})" if failed else ""))

    if failed:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch past-season team stats for Career Comparison STL%/BLK% formula."
    )
    parser.add_argument("seasons", nargs="*",
        help="Season IDs. Omit to auto-detect from current Hawks career data.")
    parser.add_argument("--measure", choices=VALID_MEASURES, default=None,
        help="Which measure to fetch. Omit to fetch both.")
    parser.add_argument("--force", action="store_true",
        help="Refetch even if a cached file already exists.")
    args = parser.parse_args()

    run(
        seasons=args.seasons if args.seasons else None,
        force=args.force,
        measures=[args.measure] if args.measure else None,
    )


if __name__ == "__main__":
    main()
