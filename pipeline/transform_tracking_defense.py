"""
Transform the latest league defense tracking raw file into a published
JSON for the frontend.

Reads the most recent data/raw/<SEASON>/league_defense_tracking_<date>.json
(the raw NBA.com response for defensive FG% allowed), pulls the subset
of fields we need, and writes:

  app/public/league_defense_tracking-<SEASON>.json

Shape of output:
{
  "season": "2026-27",
  "generated_at": "<ISO timestamp>",
  "players": [
    {
      "id": <int>,
      "name": "...",
      "team": "...",
      "position": "...",
      "gp": <int>,
      "defense": {
        "d_fga":          <per-game FGA defended>,
        "d_fgm":          <per-game FGM allowed>,
        "d_fg_pct":       <opponent FG% against this defender>,
        "normal_fg_pct":  <what those shooters normally shoot overall>,
        "pct_plusminus":  <d_fg_pct - normal_fg_pct — negative is good>
      }
    },
    ...
  ]
}
"""

import json
from datetime import datetime
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
OUT_PATH = Path("app/public") / f"league_defense_tracking-{SEASON}.json"


def load_minutes_from_base() -> dict:
    """Return {pid: {"mpg": float, "min_total": int}} from the latest base
    (leaguedashplayerstats) file. MIN in that endpoint is per-game, so season
    total = MIN × GP. Used to apply minutes-based player floors on the
    frontend Defense page."""
    files = sorted(RAW_DIR.glob("league_base_*.json"))
    if not files:
        return {}
    data = json.loads(files[-1].read_text())
    rs = next(r for r in data["resultSets"] if r["name"] == "LeagueDashPlayerStats")
    h = rs["headers"]
    pid_i = h.index("PLAYER_ID")
    gp_i  = h.index("GP")
    min_i = h.index("MIN")
    out = {}
    for row in rs["rowSet"]:
        gp  = row[gp_i] or 0
        mpg = row[min_i] or 0
        out[row[pid_i]] = {"mpg": mpg, "min_total": round(mpg * gp)}
    return out


# Which raw-file columns to carry through, mapped to output field names.
# Keep this list in one place — add more fields here if the frontend
# needs them later; no re-fetch required.
FIELD_MAP = {
    "D_FGM":          "d_fgm",
    "D_FGA":          "d_fga",
    "D_FG_PCT":       "d_fg_pct",
    "NORMAL_FG_PCT":  "normal_fg_pct",
    "PCT_PLUSMINUS":  "pct_plusminus",
}


def latest_file(pattern: str) -> Path | None:
    """Most recent file matching the glob pattern in RAW_DIR, or None."""
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def run():
    src = latest_file("league_defense_tracking_*.json")
    if src is None:
        raise FileNotFoundError(
            f"No league_defense_tracking_*.json in {RAW_DIR} — "
            "run fetch_tracking_defense.py first"
        )

    data = json.loads(src.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    rows = rs["rowSet"]

    # Build a {header: column_index} lookup once, so we can grab fields by
    # name instead of hard-coding position numbers that break if NBA.com
    # changes the column order.
    idx = {h: i for i, h in enumerate(headers)}

    minutes_by_pid = load_minutes_from_base()

    players = []
    for row in rows:
        pid = row[idx["CLOSE_DEF_PERSON_ID"]]
        mins = minutes_by_pid.get(pid, {})
        player = {
            # CLOSE_DEF_PERSON_ID is the ID column on this endpoint.
            "id":       pid,
            "name":     row[idx["PLAYER_NAME"]],
            "team":     row[idx["PLAYER_LAST_TEAM_ABBREVIATION"]],
            "position": row[idx["PLAYER_POSITION"]],
            "gp":       row[idx["GP"]],
            "mpg":        mins.get("mpg"),
            "min_total":  mins.get("min_total"),
            "defense":  {
                out_key: row[idx[raw_key]]
                for raw_key, out_key in FIELD_MAP.items()
            },
        }
        players.append(player)

    # Sort alphabetically for stable git diffs.
    players.sort(key=lambda p: p["name"])

    out = {
        "season":        SEASON,
        "generated_at":  datetime.now().astimezone().isoformat(),
        "source_file":   src.name,
        "players":       players,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"[tracking-defense] wrote {OUT_PATH} ({len(players)} players, {size_kb:.1f} KB)")


if __name__ == "__main__":
    run()
