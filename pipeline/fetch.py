from nba_api.stats.endpoints import leaguedashplayerstats

ATLANTA_TEAM_ID = 1610612737
SEASON = "2025-26"

def fetch_player_base_stats(season=SEASON, team_id=ATLANTA_TEAM_ID):
    result = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        team_id_nullable=team_id,
        per_mode_detailed="PerGame",
    )
    return result.get_dict()

if __name__ == "__main__":
    data = fetch_player_base_stats()
    headers = data["resultSets"][0]["headers"]
    rows = data["resultSets"][0]["rowSet"]
    print(f"Got {len(rows)} players, {len(headers)} stat columns")
    print(f"First player: {dict(zip(headers, rows[0]))}")