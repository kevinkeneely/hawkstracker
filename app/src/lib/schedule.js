/**
 * Schedule-based helpers for projection and prediction code.
 *
 * All functions here take a team's game list from
 * league_team_games-<season>.json (shape: array of
 * { date, opp_tricode, home_away, won, pts, opp_pts, diff, game_id }) and
 * the date of some reference game (YYYY-MM-DD string).
 */

/**
 * Was this team on the second night of a back-to-back on `gameDate`?
 *
 * True iff the team played a game on the calendar day immediately before
 * `gameDate`. Uses UTC date math so there's no timezone drift — the game
 * dates in league_team_games are plain YYYY-MM-DD strings without time.
 *
 * Nov 20: used by Phase 4 of the projection model (rest/B2B adjustments).
 *
 * @param {Array<{date: string}>} teamGames
 * @param {string} gameDate — YYYY-MM-DD
 * @returns {boolean}
 */
export function isOnB2B(teamGames, gameDate) {
  if (!teamGames || !gameDate) return false
  const anchor = new Date(gameDate + 'T00:00:00Z')
  if (isNaN(anchor)) return false
  const yesterday = new Date(anchor.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)
  return teamGames.some((g) => g.date === yesterdayStr)
}
