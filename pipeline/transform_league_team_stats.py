"""
Transform raw LeagueDashTeamStats (Advanced) into frontend-ready JSON.

Reads:
  data/raw/<SEASON>/league_team_stats_*.json  (newest file)
Writes:
  app/public/league_team_stats-<SEASON>.json

Output shape:
  {
    "season": "2026-27",
    "generated_at": "2026-11-13T18:30:00",
    "teams": [
      {
        "id": 1610612737,
        "name": "Atlanta Hawks",
        "tricode": "ATL",
        "gp": 12, "w": 7, "l": 5,
        "off_rating": 118.3, "def_rating": 112.4, "net_rating": 5.9,
        "pace": 101.2,
        "efg_pct": 0.541, "tov_pct": 0.128, "oreb_pct": 0.283, "ts_pct": 0.577, "fta_rate": 0.251
      },
      ...30 teams
    ]
  }

Downstream consumers:
  - D1 Matchup preview (lookup by tricode)
  - C1 Rolling power rating (season baselines)
"""

import json
from datetime import datetime
from glob import glob
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
OUT_PATH = Path("app/public") / f"league_team_stats-{SEASON}.json"

# NBA.com tricodes (TEAM_ABBREVIATION isn't always on this endpoint, so we
# derive them from the team name).
TRICODE_BY_NAME = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP", "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA", "Washington Wizards": "WAS",
}


def _latest(pattern: str) -> Path:
    files = sorted(glob(str(RAW_DIR / pattern)))
    if not files:
        raise FileNotFoundError(f"No file matching {pattern} in {RAW_DIR}")
    return Path(files[-1])


def transform() -> None:
    # The Advanced measure type has everything EXCEPT FTA_RATE; the Four
    # Factors measure gives us FTA_RATE (and the opponent's, which we don't
    # keep yet). Join by TEAM_ID to produce one merged row per team.
    src_adv = _latest("league_team_stats_*.json")
    src_ff  = _latest("league_team_four_factors_*.json")
    print(f"[league-team-stats] reading {src_adv}")
    print(f"[league-team-stats] reading {src_ff}")
    raw = json.loads(src_adv.read_text())
    raw_ff = json.loads(src_ff.read_text())

    rs = raw["resultSets"][0]
    headers = rs["headers"]
    col = {h: i for i, h in enumerate(headers)}

    # Build TEAM_ID -> FTA_RATE lookup from the Four Factors file
    ff_rs = raw_ff["resultSets"][0]
    ff_col = {h: i for i, h in enumerate(ff_rs["headers"])}
    fta_rate_by_team = {
        row[ff_col["TEAM_ID"]]: row[ff_col["FTA_RATE"]]
        for row in ff_rs["rowSet"]
    }

    teams = []
    for row in rs["rowSet"]:
        name = row[col["TEAM_NAME"]]
        tricode = TRICODE_BY_NAME.get(name)
        if not tricode:
            # New/renamed franchise? Warn loudly instead of silently dropping.
            print(f"[league-team-stats] WARNING unknown team name: {name!r}")
            continue
        teams.append({
            "id":          row[col["TEAM_ID"]],
            "name":        name,
            "tricode":     tricode,
            "gp":          row[col["GP"]],
            "w":           row[col["W"]],
            "l":           row[col["L"]],
            "off_rating":  row[col["OFF_RATING"]],
            "def_rating":  row[col["DEF_RATING"]],
            "net_rating":  row[col["NET_RATING"]],
            "pace":        row[col["PACE"]],
            # Four Factors — all percentages stored as 0-1 decimals to match
            # other _pct fields on the site. FTA_RATE is joined in from the
            # Four Factors measure type (fetched alongside Advanced).
            "efg_pct":     row[col["EFG_PCT"]],
            "tov_pct":     row[col["TM_TOV_PCT"]],
            "oreb_pct":    row[col["OREB_PCT"]],
            "ts_pct":      row[col["TS_PCT"]],
            "fta_rate":    fta_rate_by_team.get(row[col["TEAM_ID"]]),
        })

    out = {
        "season": SEASON,
        "generated_at": datetime.utcnow().isoformat(timespec="seconds"),
        "teams": teams,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, separators=(",", ":")))
    print(f"[league-team-stats] wrote {OUT_PATH} — {len(teams)} teams")


if __name__ == "__main__":
    transform()
