"""
Pull Hawks 5-man lineups + write a dated snapshot and a stable `latest` copy.

Combines fetch + transform in one file (no separate raw cache) because the
endpoint returns one clean aggregate per call; splitting fetch from transform
the way the boxscore scripts do it wouldn't save any API cost.

Reads: nothing (hits NBA.com directly)
Writes:
  app/public/lineups/<season>/YYYY-MM-DD-5man.json   (dated snapshot — archive)
  app/public/lineups/<season>/latest-5man.json       (overwritten each run —
                                                       stable path for frontend)

The archive copy exists so we can later build a "how did this lineup's net
rating evolve across the season" view without having to backfill history.
The frontend only ever reads `latest-5man.json`.

To add 4-man / 3-man / 2-man later: run with group_quantity=4/3/2 and write
`latest-4man.json` etc. The run() function accepts a group_quantity arg.
"""

import json
from datetime import datetime, date, timezone
from pathlib import Path

from nba_api.stats.endpoints import teamdashlineups

from pipeline.fetch import TIMEOUT, fetch_with_retries
from pipeline.config import SEASON, ATLANTA_TEAM_ID

OUT_DIR = Path("app/public/lineups") / SEASON


def _parse_player_ids(group_id: str):
    """NBA.com GROUP_ID is a dash-joined string like "-203468-1629638-..."
    with leading/trailing dashes. Return a clean list of ints."""
    return [int(x) for x in group_id.strip("-").split("-") if x]


def fetch_lineups(group_quantity: int) -> list[dict]:
    """Hit teamdashlineups Advanced measure and return a clean list of
    lineup dicts for the Hawks."""
    endpoint = fetch_with_retries(
        teamdashlineups.TeamDashLineups,
        team_id=ATLANTA_TEAM_ID,
        season=SEASON,
        measure_type_detailed_defense="Advanced",
        group_quantity=group_quantity,
        timeout=TIMEOUT,
    )
    payload = json.loads(endpoint.get_json())

    lineups_rs = next(rs for rs in payload["resultSets"] if rs["name"] == "Lineups")
    h = lineups_rs["headers"]
    i = {name: h.index(name) for name in h}  # name -> column index

    out = []
    for row in lineups_rs["rowSet"]:
        out.append({
            "group_id":    row[i["GROUP_ID"]],
            "group_name":  row[i["GROUP_NAME"]],
            "player_ids":  _parse_player_ids(row[i["GROUP_ID"]]),
            "gp":          row[i["GP"]],
            "w":           row[i["W"]],
            "l":           row[i["L"]],
            "min":         row[i["MIN"]],
            "off_rating":  row[i["OFF_RATING"]],
            "def_rating":  row[i["DEF_RATING"]],
            "net_rating":  row[i["NET_RATING"]],
            "ts_pct":      row[i["TS_PCT"]],
            "efg_pct":     row[i["EFG_PCT"]],
            # NBA.com returns FG3_PCT via Base measure, not Advanced.
            # We'll compute 3P% from the Base pull in a second step below.
            "oreb_pct":    row[i["OREB_PCT"]],
            "dreb_pct":    row[i["DREB_PCT"]],
            "reb_pct":     row[i["REB_PCT"]],
            "tm_tov_pct":  row[i["TM_TOV_PCT"]],
            "pace":        row[i["PACE"]],
            "ast_pct":     row[i["AST_PCT"]],
            "poss":        row[i["POSS"]],
        })
    return out


def enrich_with_base_stats(lineups: list[dict], group_quantity: int) -> None:
    """Fetch the Base measure in a second call and merge in FG/3P/FT splits
    (the Advanced measure doesn't carry raw shooting %s). Keyed by GROUP_ID."""
    endpoint = fetch_with_retries(
        teamdashlineups.TeamDashLineups,
        team_id=ATLANTA_TEAM_ID,
        season=SEASON,
        measure_type_detailed_defense="Base",
        group_quantity=group_quantity,
        timeout=TIMEOUT,
    )
    payload = json.loads(endpoint.get_json())
    base_rs = next(rs for rs in payload["resultSets"] if rs["name"] == "Lineups")
    h = base_rs["headers"]
    i = {name: h.index(name) for name in h}

    base_by_gid = {
        row[i["GROUP_ID"]]: {
            "fg_pct":  row[i["FG_PCT"]],
            "fg3_pct": row[i["FG3_PCT"]],
            "ft_pct":  row[i["FT_PCT"]],
            "pts":     row[i["PTS"]],
            "fga":     row[i["FGA"]],
            "fg3a":    row[i["FG3A"]],
        }
        for row in base_rs["rowSet"]
    }
    for lineup in lineups:
        extras = base_by_gid.get(lineup["group_id"], {})
        lineup.update(extras)


def run(group_quantity: int = 5):
    lineups = fetch_lineups(group_quantity)
    enrich_with_base_stats(lineups, group_quantity)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    payload = {
        "season":       SEASON,
        "generated_at": now,
        "group_size":   group_quantity,
        "min_min":      0,     # no filter applied at the data layer
        "lineups":      lineups,
    }
    text = json.dumps(payload)

    dated = OUT_DIR / f"{today}-{group_quantity}man.json"
    latest = OUT_DIR / f"latest-{group_quantity}man.json"
    dated.write_text(text)
    latest.write_text(text)

    print(
        f"[lineups] season={SEASON} group={group_quantity}-man "
        f"— wrote {len(lineups)} lineups to {dated.name} + {latest.name}"
    )


if __name__ == "__main__":
    run(5)
