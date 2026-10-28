"""Fetch today's NBA standings from NBA.com and save the raw response."""

import json
from datetime import date
from pathlib import Path

from pipeline import config  # noqa: F401 — triggers NBA.com header override
from pipeline.config import SEASON

from nba_api.stats.endpoints import leaguestandings

RAW_DIR = Path("data/raw")


def fetch_standings():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    out_path = RAW_DIR / f"standings_{today}.json"

    print(f"Fetching standings for {today} (season={SEASON})...")
    # Pass season and season_type explicitly — a bare LeagueStandings() call
    # returns whatever NBA.com considers the "current" season, which at a
    # season flip can disagree with our config.SEASON. That mismatch is how
    # standingsData-2025-26.json got overwritten with 2026-27 data on the
    # Oct 20 flip. Explicit params = our configured season is always what we
    # fetch, so the output filename and the content always match.
    response = leaguestandings.LeagueStandings(
        season=SEASON,
        season_type="Regular Season",
    )
    raw = response.get_dict()

    with open(out_path, "w") as f:
        json.dump(raw, f, indent=2)

    print(f"Wrote {out_path}")
    print("Done.")


if __name__ == "__main__":
    fetch_standings()