/**
 * Team-level game predictions.
 *
 * Inputs: both teams' current ELO (from lib/elo.js), pace, off/def ratings
 * (from league_team_stats-<season>.json), and which team is home.
 *
 * Outputs (all from the Hawks perspective):
 *   winProb   — Hawks win probability (0..1)
 *   homePts   — projected home-team final score (rounded)
 *   awayPts   — projected away-team final score (rounded)
 *   spread    — Hawks spread (negative = Hawks favored; positive = underdog)
 *   total     — implied O/U total
 *
 * Methodology
 * -----------
 * Win prob: expectedHome(home ELO, away ELO) from lib/elo.js — already
 * carries the +100 HCA, same math as the Rolling Power Rating.
 *
 * Score projection (per team):
 *   projectedPace = (teamPace + oppPace) / 2
 *   adjORtg       = teamORtg × (oppDRtg / leagueAvgRating)
 *   predPts       = adjORtg × projectedPace / 100
 *
 * Then split a typical home-court point edge: +1.5 pts home, −1.5 pts away.
 * The ~3-pt HCA matches the long-run NBA home advantage; splitting it lets
 * the spread and total both land near sportsbook consensus for average
 * matchups without actually pulling any betting line.
 *
 * This is a rough model. It should be treated as a Hawks Tracker
 * projection, never as a betting line.
 */
import { expectedHome } from './elo'

// Long-run NBA league-average rating. Rating == ORtg == DRtg in aggregate,
// so we use a single constant instead of recomputing league avg nightly.
const LEAGUE_AVG_RATING = 113

// Half the typical NBA home-court advantage, applied once to each team.
const HOME_POINT_EDGE = 1.5

/**
 * @param {object} args
 * @param {number} args.hawksElo       Current Hawks ELO.
 * @param {number} args.oppElo         Current opponent ELO.
 * @param {object} args.hawksStats     { pace, off_rating, def_rating }
 * @param {object} args.oppStats       { pace, off_rating, def_rating }
 * @param {boolean} args.hawksAreHome  true iff the Hawks are the home team
 * @returns {object} prediction (see module docstring)
 */
export function predictGame({ hawksElo, oppElo, hawksStats, oppStats, hawksAreHome }) {
  // 1. Win prob — expectedHome adds HCA to whoever is home.
  const hawksWinProb = hawksAreHome
    ? expectedHome(hawksElo, oppElo)
    : 1 - expectedHome(oppElo, hawksElo)

  // 2. Projected pace: average of both teams' paces (standard convention).
  const projectedPace = (hawksStats.pace + oppStats.pace) / 2

  // 3. Points: each team's offense normalized by opponent's defense.
  const rawHawksPts =
    (hawksStats.off_rating * (oppStats.def_rating / LEAGUE_AVG_RATING)) *
    projectedPace / 100
  const rawOppPts =
    (oppStats.off_rating * (hawksStats.def_rating / LEAGUE_AVG_RATING)) *
    projectedPace / 100

  // 4. Apply the home-court point edge symmetrically.
  const hawksPts = rawHawksPts + (hawksAreHome ? HOME_POINT_EDGE : -HOME_POINT_EDGE)
  const oppPts   = rawOppPts   + (hawksAreHome ? -HOME_POINT_EDGE : HOME_POINT_EDGE)

  // 5. Spread from the Hawks POV. Negative = Hawks favored.
  const spread = oppPts - hawksPts
  const total = hawksPts + oppPts

  return {
    winProb: hawksWinProb,
    hawksPts: Math.round(hawksPts),
    oppPts:   Math.round(oppPts),
    spread:   Number(spread.toFixed(1)),
    total:    Math.round(total),
  }
}
