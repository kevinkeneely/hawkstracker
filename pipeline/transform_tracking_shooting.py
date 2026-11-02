"""
Transform the six shot-split raw files into one published JSON with four
aggregated categories: Catch & Shoot, Pull-Up, Contested, Uncontested.

Reads the latest:
  - league_shots_cs_<date>.json     (Catch & Shoot, Touch < 2 Seconds)
  - league_shots_pullup_<date>.json (Pull-Up, Touch 2-6 Seconds)
  - league_shots_tight_<date>.json  (Defender 0-2 Feet)
  - league_shots_close_<date>.json  (Defender 2-4 Feet)
  - league_shots_open_<date>.json   (Defender 4-6 Feet)
  - league_shots_wide_<date>.json   (Defender 6+ Feet)

Carries cs and pullup through directly. Combines tight + close into
"contested" and open + wide into "uncontested" by summing attempt and
make counts, then recomputing percentages. This gives a weighted-average
percentage that correctly reflects where the shots happened.

Writes:
  app/public/league_shooting_tracking-<SEASON>.json

Shape of output:
{
  "season": "2026-27",
  "generated_at": "...",
  "players": [
    {
      "id": <int>, "name": "...", "team": "...", "gp": <int>,
      "cs":           { fga, fgm, fg_pct, efg_pct, fg3a, fg3m, fg3_pct },
      "pullup":       { ... same shape ... },
      "contested":    { ... },
      "uncontested":  { ... }
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
OUT_PATH = Path("app/public") / f"league_shooting_tracking-{SEASON}.json"

# Simple splits: one raw file → one output sub-block, no math.
SIMPLE_SPLITS = {
    "cs":     "league_shots_cs_*.json",
    "pullup": "league_shots_pullup_*.json",
}

# Aggregated splits: two raw files → one output sub-block, summed.
AGGREGATED_SPLITS = {
    "contested":    ["league_shots_tight_*.json", "league_shots_close_*.json"],
    "uncontested":  ["league_shots_open_*.json",  "league_shots_wide_*.json"],
}

# Fields we read from each raw row and put into every sub-block.
RAW_FIELDS = ["FGM", "FGA", "FG_PCT", "EFG_PCT", "FG3M", "FG3A", "FG3_PCT"]
OUT_KEYS = {f: f.lower() for f in RAW_FIELDS}


def latest_file(pattern: str) -> Path:
    files = sorted(RAW_DIR.glob(pattern))
    if not files:
        raise FileNotFoundError(
            f"No {pattern} in {RAW_DIR} — run fetch_tracking_shots.py first"
        )
    return files[-1]


def load_raw(pattern: str) -> tuple[dict, str]:
    """Load one raw shot file. Returns {player_id: {raw_field: value}} and
    the source filename."""
    src = latest_file(pattern)
    data = json.loads(src.read_text())
    rs = data["resultSets"][0]
    headers = rs["headers"]
    idx = {h: i for i, h in enumerate(headers)}

    by_pid = {}
    for row in rs["rowSet"]:
        pid = row[idx["PLAYER_ID"]]
        by_pid[pid] = {
            "name": row[idx["PLAYER_NAME"]],
            "team": row[idx["PLAYER_LAST_TEAM_ABBREVIATION"]],
            "gp":   row[idx["GP"]],
            **{f: row[idx[f]] for f in RAW_FIELDS},
        }
    return by_pid, src.name


def build_block(raw_player: dict | None) -> dict:
    """Convert one player's raw-field dict into the lowercase output shape.
    Returns {} if the player wasn't in this split's raw file."""
    if raw_player is None:
        return {}
    return {OUT_KEYS[f]: raw_player.get(f) for f in RAW_FIELDS}


def aggregate_block(parts: list[dict | None]) -> dict:
    """Sum FGM/FGA/FG3M/FG3A across two sub-splits and recompute percentages.

    parts is a list of {raw_field: value} dicts (possibly containing None if
    the player wasn't in one of the raws). Values are per-game, so summing
    gives per-game totals for the combined category, and percentages are
    properly weighted by attempts.
    """
    parts = [p for p in parts if p is not None]
    if not parts:
        return {}

    def s(key):
        total = 0.0
        for p in parts:
            v = p.get(key)
            if v is not None:
                total += v
        return total

    fgm, fga = s("FGM"), s("FGA")
    fg3m, fg3a = s("FG3M"), s("FG3A")

    return {
        "fgm":      round(fgm, 3),
        "fga":      round(fga, 3),
        "fg_pct":   round(fgm / fga, 4) if fga > 0 else None,
        "efg_pct":  round((fgm + 0.5 * fg3m) / fga, 4) if fga > 0 else None,
        "fg3m":     round(fg3m, 3),
        "fg3a":     round(fg3a, 3),
        "fg3_pct":  round(fg3m / fg3a, 4) if fg3a > 0 else None,
    }


def run():
    # Load all six raw files first; collect source filenames for the output.
    raws = {}
    source_files = {}
    for name, pattern in SIMPLE_SPLITS.items():
        raws[name], source_files[name] = load_raw(pattern)
    for name, patterns in AGGREGATED_SPLITS.items():
        source_files[name] = []
        parts = []
        for pattern in patterns:
            by_pid, src_name = load_raw(pattern)
            parts.append(by_pid)
            source_files[name].append(src_name)
        raws[name] = parts  # list of per-player dicts

    # Union of PLAYER_IDs across every raw file. A player might appear in
    # one split but not another (took zero contested shots, for example).
    all_pids = set()
    for name, data in raws.items():
        if isinstance(data, list):
            for d in data:
                all_pids.update(d.keys())
        else:
            all_pids.update(data.keys())

    # Build output: pick each player's name/team/gp from the first split that
    # has them (prefer cs since it has the broadest coverage early-season).
    def bio_for(pid):
        for name in ("cs", "pullup"):
            p = raws[name].get(pid)
            if p is not None:
                return {"name": p["name"], "team": p["team"], "gp": p["gp"]}
        # Fall back to any aggregated split.
        for name in ("contested", "uncontested"):
            for part in raws[name]:
                p = part.get(pid)
                if p is not None:
                    return {"name": p["name"], "team": p["team"], "gp": p["gp"]}
        return {"name": "?", "team": "?", "gp": 0}

    players = []
    for pid in all_pids:
        bio = bio_for(pid)
        players.append({
            "id":           pid,
            "name":         bio["name"],
            "team":         bio["team"],
            "gp":           bio["gp"],
            "cs":           build_block(raws["cs"].get(pid)),
            "pullup":       build_block(raws["pullup"].get(pid)),
            "contested":    aggregate_block([part.get(pid) for part in raws["contested"]]),
            "uncontested":  aggregate_block([part.get(pid) for part in raws["uncontested"]]),
        })

    players.sort(key=lambda p: p["name"])

    out = {
        "season":        SEASON,
        "generated_at":  datetime.now().astimezone().isoformat(),
        "source_files":  source_files,
        "players":       players,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"[tracking-shooting] wrote {OUT_PATH} ({len(players)} players, {size_kb:.1f} KB)")


if __name__ == "__main__":
    run()
