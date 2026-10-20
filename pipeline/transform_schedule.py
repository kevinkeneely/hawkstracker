"""
Transform raw schedule files into compact Hawks-only schedule.json.

Reads two sources:
  1. LeagueGameLog (completed games) — authoritative for score + matchup
  2. ScheduleLeagueV2 (full league schedule) — provides upcoming games

Merge rule: completed-game data wins when a game is in both sources.
Upcoming-only games are added with status_code=1 (scheduled).

Writes: app/public/schedule.json
"""

import json
from pathlib import Path

from pipeline.config import SEASON

HAWKS_TEAM_ID = 1610612737
RAW_DIR = Path("data/raw") / SEASON
from pipeline.config import SCHEDULE_FILENAME
OUT_PATH = Path("app/public") / SCHEDULE_FILENAME


def latest_file(pattern: str) -> Path | None:
    files = sorted(RAW_DIR.glob(pattern))
    return files[-1] if files else None


def parse_completed() -> list[dict]:
    """Hawks completed games from LeagueGameLog (schedule_<date>.json)."""
    files = sorted(
        f for f in RAW_DIR.glob("schedule_*.json")
        if "upcoming" not in f.name
    )
    if not files:
        return []
    data = json.loads(files[-1].read_text())
    rs = data["resultSets"][0]
    idx = {h: i for i, h in enumerate(rs["headers"])}

    games_by_id = {}
    for row in rs["rowSet"]:
        gid = row[idx["GAME_ID"]]
        games_by_id.setdefault(gid, []).append(row)

    games = []
    for gid, rows in games_by_id.items():
        hawks_row = next(
            (r for r in rows if r[idx["TEAM_ID"]] == HAWKS_TEAM_ID), None
        )
        if hawks_row is None:
            continue
        opp_row = next(
            (r for r in rows if r[idx["TEAM_ID"]] != HAWKS_TEAM_ID), None
        )
        matchup = hawks_row[idx["MATCHUP"]]
        home_away = "home" if "vs." in matchup else "away"
        games.append({
            "game_id": gid,
            "date": hawks_row[idx["GAME_DATE"]],
            "opp_tricode": opp_row[idx["TEAM_ABBREVIATION"]] if opp_row else None,
            "opp_name": opp_row[idx["TEAM_NAME"]] if opp_row else None,
            "home_away": home_away,
            "status": "Final",
            "status_code": 3,
            "hawks_score": hawks_row[idx["PTS"]],
            "opp_score": opp_row[idx["PTS"]] if opp_row else None,
        })
    return games


def parse_upcoming() -> list[dict]:
    """Hawks games from ScheduleLeagueV2 (includes past + future)."""
    f = latest_file("schedule_upcoming_*.json")
    if f is None:
        return []
    data = json.loads(f.read_text())
    all_dates = data.get("leagueSchedule", {}).get("gameDates", [])

    games = []
    for day in all_dates:
        for g in day.get("games", []):
            home = g.get("homeTeam", {})
            away = g.get("awayTeam", {})
            hawks_is_home = home.get("teamId") == HAWKS_TEAM_ID
            hawks_is_away = away.get("teamId") == HAWKS_TEAM_ID
            if not (hawks_is_home or hawks_is_away):
                continue
            hawks = home if hawks_is_home else away
            opp = away if hawks_is_home else home
            game_date = g.get("gameDateEst", "").split("T")[0]
            games.append({
                "game_id": g.get("gameId"),
                "date": game_date,
                "opp_tricode": opp.get("teamTricode"),
                "opp_name": f"{opp.get('teamCity', '')} {opp.get('teamName', '')}".strip(),
                "home_away": "home" if hawks_is_home else "away",
                "status": g.get("gameStatusText"),
                "status_code": g.get("gameStatus"),  # 1=scheduled, 2=live, 3=final
                "hawks_score": hawks.get("score"),
                "opp_score": opp.get("score"),
            })
    return games


def run():
    completed = parse_completed()
    upcoming_all = parse_upcoming()

    # Dedupe: completed wins. ScheduleLeagueV2 may also list finished
    # games — we skip those since LeagueGameLog has the real scores.
    completed_ids = {g["game_id"] for g in completed}
    upcoming_only = [g for g in upcoming_all if g["game_id"] not in completed_ids]

    games = completed + upcoming_only
    games.sort(key=lambda x: x["date"])

    out = {"season": SEASON, "games": games}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    print(
        f"[schedule] wrote {OUT_PATH} "
        f"({len(completed)} completed + {len(upcoming_only)} upcoming "
        f"= {len(games)} total)"
    )


if __name__ == "__main__":
    run()