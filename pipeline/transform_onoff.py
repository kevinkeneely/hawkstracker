"""
Pull Hawks on/off splits per player and write dated snapshot + stable `latest`.

Same pattern as transform_lineups.py (fetch + transform in one file).

Reads: nothing (hits NBA.com directly)
Writes:
  app/public/lineups/<season>/YYYY-MM-DD-onoff.json
  app/public/lineups/<season>/latest-onoff.json

Output shape (one entry per Hawks player):
  {
    "season":        "2026-27",
    "generated_at":  "...",
    "players": [
      {
        "player_id":   1629638,
        "player_name": "Alexander-Walker, Nickeil",
        "gp_on":       12,
        "min_on":      373.0,
        "off_rating_on": 114.3,
        "def_rating_on": 111.1,
        "net_rating_on": 3.2,
        "gp_off":      12,
        "min_off":     203.0,
        "off_rating_off": 111.3,
        "def_rating_off": 108.1,
        "net_rating_off": 3.2,
        "net_swing":   0.0,       # on NET minus off NET
      },
      ...
    ]
  }

Only players with GP_ON > 0 are included (i.e. players who've actually seen
floor time this season — the "off-only" rows for inactive players are
captured in the raw response but filtered out at the pipeline layer).
"""

import json
from datetime import datetime, date, timezone
from pathlib import Path

from nba_api.stats.endpoints import teamplayeronoffsummary

from pipeline.fetch import TIMEOUT, fetch_with_retries
from pipeline.config import SEASON, ATLANTA_TEAM_ID

OUT_DIR = Path("app/public/lineups") / SEASON


def _row_to_dict(row, headers):
    return {h: row[i] for i, h in enumerate(headers)}


def fetch_onoff():
    endpoint = fetch_with_retries(
        teamplayeronoffsummary.TeamPlayerOnOffSummary,
        team_id=ATLANTA_TEAM_ID,
        season=SEASON,
        measure_type_detailed_defense="Advanced",
        timeout=TIMEOUT,
    )
    payload = json.loads(endpoint.get_json())
    on_rs  = next(rs for rs in payload["resultSets"]
                  if rs["name"] == "PlayersOnCourtTeamPlayerOnOffSummary")
    off_rs = next(rs for rs in payload["resultSets"]
                  if rs["name"] == "PlayersOffCourtTeamPlayerOnOffSummary")

    on_by_pid  = {r[on_rs["headers"].index("VS_PLAYER_ID")]:  _row_to_dict(r, on_rs["headers"])
                  for r in on_rs["rowSet"]}
    off_by_pid = {r[off_rs["headers"].index("VS_PLAYER_ID")]: _row_to_dict(r, off_rs["headers"])
                  for r in off_rs["rowSet"]}

    players = []
    for pid, on in on_by_pid.items():
        off = off_by_pid.get(pid, {})
        net_on  = on.get("NET_RATING")
        net_off = off.get("NET_RATING")
        swing = (net_on - net_off) if (net_on is not None and net_off is not None) else None
        players.append({
            "player_id":     pid,
            "player_name":   on.get("VS_PLAYER_NAME"),
            "gp_on":         on.get("GP"),
            "min_on":        on.get("MIN"),
            "off_rating_on": on.get("OFF_RATING"),
            "def_rating_on": on.get("DEF_RATING"),
            "net_rating_on": net_on,
            "plus_minus_on": on.get("PLUS_MINUS"),
            "gp_off":        off.get("GP"),
            "min_off":       off.get("MIN"),
            "off_rating_off": off.get("OFF_RATING"),
            "def_rating_off": off.get("DEF_RATING"),
            "net_rating_off": net_off,
            "plus_minus_off": off.get("PLUS_MINUS"),
            "net_swing":     swing,
        })
    return players


def run():
    players = fetch_onoff()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    payload = {
        "season":       SEASON,
        "generated_at": now,
        "players":      players,
    }
    text = json.dumps(payload)

    dated = OUT_DIR / f"{today}-onoff.json"
    latest = OUT_DIR / "latest-onoff.json"
    dated.write_text(text)
    latest.write_text(text)

    print(f"[onoff] season={SEASON} — wrote {len(players)} players to "
          f"{dated.name} + {latest.name}")


if __name__ == "__main__":
    run()
