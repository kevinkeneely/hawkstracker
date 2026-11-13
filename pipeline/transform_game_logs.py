"""
Build per-player + per-team game-log arrays for the Trends tab.

Reads:
  app/public/schedule-<season>.json
  app/public/boxscores/<game_id>.json           (traditional)
  app/public/boxscores/<game_id>-advanced.json  (advanced, V3 nested shape)

Writes:
  app/public/game_logs-<season>.json

Shape:
  {
    "season": "...",
    "generated_at": "...",
    "team": { "games": [ { per-game entry }, ... ] },
    "players": [
      { "id", "name", "games": [ { per-game entry }, ... ] },
      ...
    ]
  }

Per-game entry fields (all nullable):
  game_id, date, opp_tricode, home_away, won,
  min, pts, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, ft_pct,
  efg_pct, ts_pct, net_rating, off_rating, def_rating

Players who did not play in a given game (DNP) are skipped for that
game — frontend handles gaps naturally in the sparkline.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from pipeline.config import SEASON, SCHEDULE_FILENAME, ATLANTA_TEAM_ID

SCHEDULE_PATH = Path("app/public") / SCHEDULE_FILENAME
BOXSCORE_DIR  = Path("app/public/boxscores")
OUT_PATH      = Path(f"app/public/game_logs-{SEASON}.json")


def _pct_from_ratio(v):
    """V3's turnoverRatio is already percentage-scaled (14.1 means 14.1%).
    Divide by 100 so we store it as a decimal like the other percentage stats."""
    return v / 100 if v is not None else None


def _mmss_to_min(s):
    """NBA.com MIN is 'MM:SS' or 'MM.SS' or 'MM' — turn into a float."""
    if s is None or s == "":
        return None
    s = str(s)
    if ":" in s:
        m, sec = s.split(":")
        return round(int(m) + int(sec) / 60, 2)
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _load_traditional(gid):
    """Return (team_row, {player_id: player_row}) for Hawks only."""
    p = BOXSCORE_DIR / f"{gid}.json"
    if not p.exists():
        return None, {}
    d = json.loads(p.read_text())
    player_rs = next(rs for rs in d["resultSets"] if rs["name"] == "PlayerStats")
    team_rs   = next(rs for rs in d["resultSets"] if rs["name"] == "TeamStats")
    ph = player_rs["headers"]
    th = team_rs["headers"]

    players = {}
    for row in player_rs["rowSet"]:
        if row[ph.index("TEAM_ID")] != ATLANTA_TEAM_ID:
            continue
        # Skip DNPs
        if row[ph.index("COMMENT")] and "DNP" in row[ph.index("COMMENT")].upper():
            continue
        if row[ph.index("MIN")] in (None, "", "0:00"):
            continue
        players[row[ph.index("PLAYER_ID")]] = {h: row[i] for i, h in enumerate(ph)}

    team = None
    for row in team_rs["rowSet"]:
        if row[th.index("TEAM_ID")] == ATLANTA_TEAM_ID:
            team = {h: row[i] for i, h in enumerate(th)}
            break

    return team, players


def _load_advanced(gid):
    """Return (team_adv, {player_id: player_adv}) for Hawks only.

    V3 response shape:
      d['boxScoreAdvanced']['homeTeam' | 'awayTeam']['players'][...]
      each player has 'personId' and 'statistics' (netRating, etc.)
    """
    p = BOXSCORE_DIR / f"{gid}-advanced.json"
    if not p.exists():
        return None, {}
    d = json.loads(p.read_text())
    bsa = d.get("boxScoreAdvanced")
    if not bsa:
        return None, {}

    players = {}
    team = None
    for side in ("homeTeam", "awayTeam"):
        side_obj = bsa.get(side, {})
        if side_obj.get("teamId") != ATLANTA_TEAM_ID:
            continue
        for p in side_obj.get("players", []):
            pid = p.get("personId")
            if pid is None:
                continue
            players[pid] = p.get("statistics", {})
        # Team-level advanced stats
        team = side_obj.get("statistics", {})
    return team, players


def _game_entry(game, trad_row, adv_row):
    """Merge one game's traditional + advanced rows into a flat entry."""
    if trad_row is None:
        return None
    return {
        "game_id":     game["game_id"],
        "date":        game["date"],
        "opp_tricode": game["opp_tricode"],
        "home_away":   game["home_away"],
        "won":         (game.get("hawks_score") or 0) > (game.get("opp_score") or 0),
        "min":         _mmss_to_min(trad_row.get("MIN")),
        "pts":         trad_row.get("PTS"),
        "fgm":         trad_row.get("FGM"),
        "fga":         trad_row.get("FGA"),
        "fg_pct":      trad_row.get("FG_PCT"),
        "fg3m":        trad_row.get("FG3M"),
        "fg3a":        trad_row.get("FG3A"),
        "fg3_pct":     trad_row.get("FG3_PCT"),
        "ftm":         trad_row.get("FTM"),
        "fta":         trad_row.get("FTA"),
        "ft_pct":      trad_row.get("FT_PCT"),
        "efg_pct":     (adv_row or {}).get("effectiveFieldGoalPercentage"),
        "ts_pct":      (adv_row or {}).get("trueShootingPercentage"),
        "net_rating":  (adv_row or {}).get("netRating"),
        "off_rating":  (adv_row or {}).get("offensiveRating"),
        "def_rating":  (adv_row or {}).get("defensiveRating"),
    }


def _team_game_entry(game, trad_team, adv_team):
    """Team-level per-game entry for the top-of-page team trends."""
    if trad_team is None:
        return None
    return {
        "game_id":     game["game_id"],
        "date":        game["date"],
        "opp_tricode": game["opp_tricode"],
        "home_away":   game["home_away"],
        "won":         (game.get("hawks_score") or 0) > (game.get("opp_score") or 0),
        "pts_scored":  game.get("hawks_score"),
        "pts_allowed": game.get("opp_score"),
        "net_rating":  (adv_team or {}).get("netRating"),
        "off_rating":  (adv_team or {}).get("offensiveRating"),
        "def_rating":  (adv_team or {}).get("defensiveRating"),
        "pace":        (adv_team or {}).get("pace"),
        "ts_pct":      (adv_team or {}).get("trueShootingPercentage"),
        "efg_pct":     (adv_team or {}).get("effectiveFieldGoalPercentage"),
        # OReb% already decimal (0.37 = 37%). TOV% comes in as percentage-scaled
        # (14.1 = 14.1%) so divide by 100 to match the rest.
        "oreb_pct":    (adv_team or {}).get("offensiveReboundPercentage"),
        "tov_pct":     _pct_from_ratio((adv_team or {}).get("turnoverRatio")),
    }


def run():
    if not SCHEDULE_PATH.exists():
        raise FileNotFoundError(f"{SCHEDULE_PATH} missing")
    sched = json.loads(SCHEDULE_PATH.read_text())
    played = [g for g in sched.get("games", []) if g.get("status_code") == 3]
    # Order chronologically — essential for sparkline x-axis
    played.sort(key=lambda g: g.get("date", ""))

    players = {}   # pid -> {id, name, games:[]}
    team_games = []

    for game in played:
        gid = game["game_id"]
        trad_team, trad_players = _load_traditional(gid)
        adv_team,  adv_players  = _load_advanced(gid)

        tg = _team_game_entry(game, trad_team, adv_team)
        if tg is not None:
            team_games.append(tg)

        for pid, trad_row in trad_players.items():
            entry = _game_entry(game, trad_row, adv_players.get(pid))
            if entry is None:
                continue
            if pid not in players:
                players[pid] = {
                    "id": pid,
                    "name": trad_row.get("PLAYER_NAME"),
                    "games": [],
                }
            players[pid]["games"].append(entry)

    # Sort player list by number of games (most-featured first)
    player_list = sorted(players.values(), key=lambda p: -len(p["games"]))

    out = {
        "season": SEASON,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "team": {"games": team_games},
        "players": player_list,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out))
    print(
        f"[game-logs] wrote {OUT_PATH} — {len(team_games)} team games, "
        f"{len(player_list)} players (total {sum(len(p['games']) for p in player_list)} player-games)"
    )


if __name__ == "__main__":
    run()
