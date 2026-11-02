"""Try fetching ONLY Catch & Shoot shots to verify the touch_time param works."""
import json
from nba_api.stats.endpoints import leaguedashplayerptshot

endpoint = leaguedashplayerptshot.LeagueDashPlayerPtShot(
    season="2026-27",
    season_type_all_star="Regular Season",
    per_mode_simple="PerGame",
    touch_time_range_nullable="Touch < 2 Seconds",
    timeout=60,
)
data = json.loads(endpoint.get_json())
rs = data["resultSets"][0]
print(f"[C&S] {len(rs['rowSet'])} rows, {len(rs['headers'])} columns")
print(f"Headers: {rs['headers']}")
# Find a known shooter — Steph Curry PLAYER_ID is 201939
for row in rs["rowSet"]:
    if row[1] == "Stephen Curry" or row[1] == "Trae Young" or "Alexander-Walker" in row[1]:
        pairs = dict(zip(rs['headers'], row))
        print(f"\n{row[1]}: {pairs}")
