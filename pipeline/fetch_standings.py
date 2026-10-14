"""Fetch today's NBA standings from NBA.com and save the raw response."""

import json
from datetime import date
from pathlib import Path

from pipeline import config  # noqa: F401 — triggers NBA.com header override

from nba_api.stats.endpoints import leaguestandings

RAW_DIR = Path("data/raw")


def fetch_standings():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    out_path = RAW_DIR / f"standings_{today}.json"

    print(f"Fetching standings for {today}...")
    response = leaguestandings.LeagueStandings()
    raw = response.get_dict()

    with open(out_path, "w") as f:
        json.dump(raw, f, indent=2)

    print(f"Wrote {out_path}")
    print("Done.")


if __name__ == "__main__":
    fetch_standings()