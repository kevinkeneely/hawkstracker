"""
Transform raw LeagueGameFinder into frontend-ready per-team game logs.

Reads:
  data/raw/<SEASON>/league_team_games_*.json  (newest file)
Writes:
  app/public/league_team_games-<SEASON>.json

LeagueGameFinder returns one row per team per game (so each game appears
twice — once from each team's perspective). We keep both rows and group
by team_id. Downstream consumers:

  - C1 Rolling power rating — per-team game log + opponent strength lookup
  - D1 Matchup preview — recent form (uses the last N games per team)

Output shape:
  {
    "season": "2026-27",
    "generated_at": "...",
    "games_by_team": {
      "1610612737": [  # ATL
        {
          "game_id": "0012500014",
          "date": "2025-10-21",
          "opp_tricode": "TOR",
          "home_away": "home",
          "won": true,
          "pts": 118, "opp_pts": 110,
          "diff": 8
        },
        ...
      ],
      ...30 teams
    }
  }
"""

import json
from collections import defaultdict
from datetime import datetime
from glob import glob
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
OUT_PATH = Path("app/public") / f"league_team_games-{SEASON}.json"


def _latest(pattern: str) -> Path:
    files = sorted(glob(str(RAW_DIR / pattern)))
    if not files:
        raise FileNotFoundError(f"No file matching {pattern} in {RAW_DIR}")
    return Path(files[-1])


def transform() -> None:
    src = _latest("league_team_games_*.json")
    print(f"[league-team-games] reading {src}")
    raw = json.loads(src.read_text())

    rs = raw["resultSets"][0]
    headers = rs["headers"]
    col = {h: i for i, h in enumerate(headers)}

    # First pass: build a (game_id -> [row, row]) lookup so we can compute
    # opponent points for each perspective without a second API call. Every
    # regular-season game shows up twice in this endpoint (once per team),
    # and MATCHUP ("ATL vs. TOR" or "ATL @ TOR") tells us home/away.
    pairs: dict[str, list] = defaultdict(list)
    for row in rs["rowSet"]:
        pairs[row[col["GAME_ID"]]].append(row)

    games_by_team: dict[str, list] = defaultdict(list)
    for game_id, rows in pairs.items():
        if len(rows) != 2:
            # Preseason joint games (vs a non-NBA team) can leave an orphan;
            # skip — can't compute opp pts without the other side of the row.
            continue
        a, b = rows
        for us, them in ((a, b), (b, a)):
            matchup = us[col["MATCHUP"]]  # e.g. "ATL vs. TOR" or "ATL @ TOR"
            home_away = "home" if "vs." in matchup else "away"
            opp_tricode = matchup.split()[-1]
            our_pts = us[col["PTS"]]
            opp_pts = them[col["PTS"]]
            wl = us[col["WL"]]
            games_by_team[str(us[col["TEAM_ID"]])].append({
                "game_id":     game_id,
                "date":        us[col["GAME_DATE"]],
                "opp_tricode": opp_tricode,
                "home_away":   home_away,
                "won":         wl == "W",
                "pts":         our_pts,
                "opp_pts":     opp_pts,
                "diff":        (our_pts or 0) - (opp_pts or 0),
            })

    # Sort each team's games chronologically so a frontend slice(-N) gives
    # the most recent window naturally.
    for team_id in games_by_team:
        games_by_team[team_id].sort(key=lambda g: g["date"])

    out = {
        "season": SEASON,
        "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
        "games_by_team": games_by_team,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    total = sum(len(v) for v in games_by_team.values())
    print(f"[league-team-games] wrote {OUT_PATH} — {len(games_by_team)} teams, {total} team-game rows")


if __name__ == "__main__":
    transform()
