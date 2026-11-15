/**
 * NBA ELO ratings — FiveThirtyEight-style.
 *
 * Reference (closest public writeup of the method):
 *   https://fivethirtyeight.com/features/how-our-nba-predictions-work/
 *
 * Design choices (confirmed in the build-plan convo):
 *   - Base rating 1505 (538's neutral value, slightly above traditional 1500)
 *   - K-factor 20 (538's NBA K)
 *   - Home-court advantage: +100 ELO added to the home team's rating in the
 *     expected-outcome formula (and in the MOV autocorrelation term below)
 *   - MOV multiplier with autocorrelation correction so that a strong team
 *     beating a weak team by 20 doesn't inflate its rating as much as a
 *     weak team beating a strong team by 20 (upsets > expected results)
 *   - Preseason carryover: 75% of prior season's final rating + 25% × 1505,
 *     so championship teams don't reset to the mean each October
 */

export const BASE_RATING = 1505
export const K = 20
export const HOME_ADVANTAGE = 100
export const CARRYOVER = 0.75

/**
 * Expected win probability for the home team against the away team, with
 * home-court adjustment baked in.
 */
export function expectedHome(homeElo, awayElo) {
  const diff = (homeElo + HOME_ADVANTAGE) - awayElo
  return 1 / (1 + Math.pow(10, -diff / 400))
}

/**
 * FiveThirtyEight margin-of-victory multiplier.
 *
 * ln(margin + 1) gives diminishing returns on blowouts.
 * The second term is the autocorrelation correction: it dampens big wins
 * by heavily favored teams (where a blowout was expected) and keeps
 * surprise-blowout ratings honest.
 *
 * @param margin                absolute point differential (always > 0)
 * @param winnerAdjEloMinusLoser winner's adjusted ELO minus loser's;
 *   adjusted ELO = team's ELO + 100 if they were at home.
 *   Positive means the winner was favored; negative means an upset
 *   (upsets get a higher multiplier → bigger rating swing).
 */
export function movMultiplier(margin, winnerAdjEloMinusLoser) {
  const absMargin = Math.abs(margin)
  return Math.log(absMargin + 1) * (2.2 / (0.001 * winnerAdjEloMinusLoser + 2.2))
}

/**
 * Apply one game. Returns updated { home, away } ratings.
 *
 * homeScore vs awayScore decides the winner. Ties aren't a thing in NBA
 * regular season, but if encountered we treat as 0.5 outcome and 0 MOV.
 */
export function updateElo(homeElo, awayElo, homeScore, awayScore) {
  const expected = expectedHome(homeElo, awayElo)
  const margin = homeScore - awayScore
  if (margin === 0) {
    const delta = K * (0.5 - expected)
    return { home: homeElo + delta, away: awayElo - delta }
  }
  const actual = margin > 0 ? 1 : 0
  const adjHome = homeElo + HOME_ADVANTAGE
  const winnerAdj = margin > 0 ? adjHome : awayElo
  const loserAdj  = margin > 0 ? awayElo : adjHome
  const mov = movMultiplier(margin, winnerAdj - loserAdj)
  const delta = K * mov * (actual - expected)
  return { home: homeElo + delta, away: awayElo - delta }
}

/**
 * Dedupe games_by_team into unique chronological games. Each game appears
 * twice in the pipeline file (once per team's perspective); we want one
 * entry per game with both team IDs identified and the home team labeled.
 *
 * Returns: array sorted by date ascending, each
 *   { game_id, date, home_id, away_id, home_pts, away_pts }
 */
export function uniqueGames(gamesByTeam) {
  const seen = new Map() // game_id → { home_id, away_id, home_pts, away_pts, date }
  for (const [teamIdStr, games] of Object.entries(gamesByTeam || {})) {
    const teamId = Number(teamIdStr)
    for (const g of games) {
      const existing = seen.get(g.game_id)
      if (existing) {
        // Fill in the other side
        if (g.home_away === 'home') {
          existing.home_id = teamId
          existing.home_pts = g.pts
        } else {
          existing.away_id = teamId
          existing.away_pts = g.pts
        }
      } else {
        const entry = {
          game_id: g.game_id,
          date: g.date,
          home_id: g.home_away === 'home' ? teamId : null,
          away_id: g.home_away === 'away' ? teamId : null,
          home_pts: g.home_away === 'home' ? g.pts : null,
          away_pts: g.home_away === 'away' ? g.pts : null,
        }
        seen.set(g.game_id, entry)
      }
    }
  }
  // Drop any games missing a side (shouldn't happen but defensive)
  const complete = [...seen.values()].filter(
    (g) => g.home_id != null && g.away_id != null && g.home_pts != null && g.away_pts != null
  )
  complete.sort((a, b) => a.date.localeCompare(b.date))
  return complete
}

/**
 * Run ELO across a chronological list of games. Returns final ratings
 * keyed by team_id. Teams not in `initialRatings` start at BASE_RATING.
 */
export function runSeason(games, initialRatings = {}) {
  const ratings = { ...initialRatings }
  const get = (id) => (ratings[id] == null ? (ratings[id] = BASE_RATING) : ratings[id])
  for (const g of games) {
    const h = get(g.home_id)
    const a = get(g.away_id)
    const { home, away } = updateElo(h, a, g.home_pts, g.away_pts)
    ratings[g.home_id] = home
    ratings[g.away_id] = away
  }
  return ratings
}

/**
 * Apply preseason carryover: 75% of prior rating + 25% × BASE_RATING.
 * Teams not in priorRatings get BASE_RATING.
 */
export function carryOver(priorRatings) {
  const out = {}
  for (const [id, r] of Object.entries(priorRatings)) {
    out[id] = CARRYOVER * r + (1 - CARRYOVER) * BASE_RATING
  }
  return out
}

/**
 * Walk games chronologically and snapshot every team's rating after each
 * date that had games. Returns an array of
 *   { date, ratings: { team_id: elo } }
 * one entry per distinct date, in chronological order. Teams that haven't
 * played yet show BASE_RATING (or their carryover starting value).
 *
 * Also returns `allRatings` — the final ratings at the end of the window.
 */
export function ratingHistoryByDate(games, initialRatings = {}) {
  const ratings = { ...initialRatings }
  const get = (id) => (ratings[id] == null ? (ratings[id] = BASE_RATING) : ratings[id])
  const history = []
  let currentDate = null
  for (const g of games) {
    if (currentDate != null && g.date !== currentDate) {
      history.push({ date: currentDate, ratings: { ...ratings } })
    }
    currentDate = g.date
    const h = get(g.home_id)
    const a = get(g.away_id)
    const { home, away } = updateElo(h, a, g.home_pts, g.away_pts)
    ratings[g.home_id] = home
    ratings[g.away_id] = away
  }
  // Push the final date's snapshot
  if (currentDate != null) {
    history.push({ date: currentDate, ratings: { ...ratings } })
  }
  return { history, finalRatings: ratings }
}

/**
 * Given a ratings snapshot, return sorted ranks for every team:
 *   { team_id: rank }  where 1 is best.
 */
export function ranksOf(ratings) {
  const sorted = Object.entries(ratings).sort((a, b) => b[1] - a[1])
  const ranks = {}
  sorted.forEach(([id], i) => { ranks[id] = i + 1 })
  return ranks
}
