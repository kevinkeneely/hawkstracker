"""
Transform the three playmaking raw files into one published JSON.

Reads the latest:
  - data/raw/<SEASON>/league_drives_<date>.json
  - data/raw/<SEASON>/league_passing_<date>.json
  - data/raw/<SEASON>/league_possessions_<date>.json

Merges them by PLAYER_ID so each output player gets three sub-blocks
(drives, passing, possessions). Writes:

  app/public/league_playmaking_tracking-<SEASON>.json

Shape of output:
{
  "season": "2026-27",
  "generated_at": "...",
  "players": [
    {
      "id": <int>, "name": "...", "team": "...", "gp": <int>, "mpg": <float>,
      "drives":       { ... fields from FIELD_MAPS["drives"] ... },
      "passing":      { ... },
      "possessions":  { ... }
    },
    ...
  ]
}

A player who appears in some files but not others (e.g. hasn't drawn a
drive yet) still gets a row — missing blocks are stored as {} rather
than dropped.
"""

import json
from datetime import datetime
from pathlib import Path

from pipeline.config import SEASON

RAW_DIR = Path("data/raw") / SEASON
OUT_PATH = Path("app/public") / f"league_playmaking_tracking-{SEASON}.json"


# Which raw columns go into each output sub-block, with their output names.
# To surface more fields later, add to the right dict here — no re-fetch
# needed since the raw files preserve everything.
FIELD_MAPS = {
    "drives": {
        "DRIVES":        "drives",
        "DRIVE_FGM":     "drive_fgm",
        "DRIVE_FGA":     "drive_fga",
        "DRIVE_FG_PCT":  "drive_fg_pct",
        "DRIVE_PTS":     "drive_pts",
        "DRIVE_AST":     "drive_ast",
        "DRIVE_TOV":     "drive_tov",
    },
    "passing": {
        "PASSES_MADE":         "passes_made",
        "PASSES_RECEIVED":     "passes_received",
        "POTENTIAL_AST":       "potential_ast",
        "AST_POINTS_CREATED":  "ast_points_created",
        "AST_TO_PASS_PCT":     "ast_to_pass_pct",
    },
    "possessions": {
        "TOUCHES":            "touches",
        "FRONT_CT_TOUCHES":   "front_ct_touches",
        "TIME_OF_POSS":       "time_of_poss",
        "AVG_SEC_PER_TOUCH":  "avg_sec_per_touch",
        "PTS_PER_TOUCH":      "pts_per_touch",
        "ELBOW_TOUCHES":      "elbow_touches",
        "POST_TOUCHES":       "post_touches",
        "PAINT_TOUCHES":      "paint_touches",
    },
}

# Each sub-block maps to a filename pattern. The suffix after _ is the slug.
FILE_PATTERNS = {
    "drives":      "league_drives_*.json",
    "passing":     "league_passing_*.json",
    "possessions": "league_possessions_*.json",
}


def latest_file(pattern: str) -> Path:
    """Most recent file matching the glob pattern in RAW_DIR.
    Raises FileNotFoundError if none exist — this signals the user to
    run the matching fetch script first."""
    files = sorted(RAW_DIR.glob(pattern))
    if not files:
        raise FileNotFoundError(
            f"No {pattern} in {RAW_DIR} — run the matching fetch script first"
        )
    return files[-1]


def load_sub_block(block_name: str) -> tuple[dict, str]:
    """Load one raw file and return a {player_id: {sub-block fields}} dict.

    Also returns the source filename so run() can report what was used.
    """
    src = latest_file(FILE_PATTERNS[block_name])
    data = json.loads(src.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    idx = {h: i for i, h in enumerate(headers)}
    field_map = FIELD_MAPS[block_name]

    by_pid = {}
    for row in rs["rowSet"]:
        pid = row[idx["PLAYER_ID"]]
        by_pid[pid] = {
            out_key: row[idx[raw_key]]
            for raw_key, out_key in field_map.items()
        }
    return by_pid, src.name


def load_bios() -> tuple[dict, str]:
    """Pull player name/team/GP/MIN from the drives file (any of the three
    would work — they all share these columns). Returns {pid: bio} and
    the source filename."""
    src = latest_file(FILE_PATTERNS["drives"])
    data = json.loads(src.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    idx = {h: i for i, h in enumerate(headers)}

    bios = {}
    for row in rs["rowSet"]:
        pid = row[idx["PLAYER_ID"]]
        bios[pid] = {
            "name": row[idx["PLAYER_NAME"]],
            "team": row[idx["TEAM_ABBREVIATION"]],
            "gp":   row[idx["GP"]],
            "mpg":  row[idx["MIN"]],
        }
    return bios, src.name


def run():
    bios, bios_src = load_bios()
    drives,       drives_src       = load_sub_block("drives")
    passing,      passing_src      = load_sub_block("passing")
    possessions,  possessions_src  = load_sub_block("possessions")

    # Union of all player IDs across the three endpoints. Rare case: a
    # player is in passing but not drives (never drove the ball). We still
    # include them with an empty drives block.
    all_pids = set(bios) | set(drives) | set(passing) | set(possessions)

    players = []
    for pid in all_pids:
        bio = bios.get(pid, {"name": "?", "team": "?", "gp": 0, "mpg": 0})
        players.append({
            "id":           pid,
            "name":         bio["name"],
            "team":         bio["team"],
            "gp":           bio["gp"],
            "mpg":          bio["mpg"],
            "drives":       drives.get(pid, {}),
            "passing":      passing.get(pid, {}),
            "possessions":  possessions.get(pid, {}),
        })

    players.sort(key=lambda p: p["name"])

    out = {
        "season":        SEASON,
        "generated_at":  datetime.now().astimezone().isoformat(),
        "source_files":  {
            "drives":       drives_src,
            "passing":      passing_src,
            "possessions":  possessions_src,
        },
        "players":       players,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"[tracking-playmaking] wrote {OUT_PATH} ({len(players)} players, {size_kb:.1f} KB)")


if __name__ == "__main__":
    run()
