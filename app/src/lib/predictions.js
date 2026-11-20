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
 * Nov 20 (Phase 4): also subtract 1.5 pts from any team that's on the
 * second night of a back-to-back (hawksOnB2B / oppOnB2B flags). Mirrors
 * the HCA magnitude for simplicity — tune separately if backtest MAE
 * says the real B2B effect on team scoring is bigger or smaller.
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

// Nov 20 (Phase 4): second-night-of-a-back-to-back scoring penalty, applied
// per team. Set to match HOME_POINT_EDGE magnitude as a defensible starting
// point — the real NBA effect is 2-3 pts across many games, so 1.5 errs
// slightly conservative. Tune once we see backtest numbers on Phase 4.
const B2B_POINT_PENALTY = 1.5

/**
 * @param {object} args
 * @param {number} args.hawksElo       Current Hawks ELO.
 * @param {number} args.oppElo         Current opponent ELO.
 * @param {object} args.hawksStats     { pace, off_rating, def_rating }
 * @param {object} args.oppStats       { pace, off_rating, def_rating }
 * @param {boolean} args.hawksAreHome  true iff the Hawks are the home team
 * @param {boolean} [args.hawksOnB2B=false]  true iff Hawks played the day
 *                                           before this game (Phase 4)
 * @param {boolean} [args.oppOnB2B=false]    true iff opp played the day
 *                                           before this game (Phase 4)
 * @returns {object} prediction (see module docstring)
 */
export function predictGame({ hawksElo, oppElo, hawksStats, oppStats, hawksAreHome, hawksOnB2B = false, oppOnB2B = false }) {
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
  const hawksPtsAfterHca = rawHawksPts + (hawksAreHome ? HOME_POINT_EDGE : -HOME_POINT_EDGE)
  const oppPtsAfterHca   = rawOppPts   + (hawksAreHome ? -HOME_POINT_EDGE : HOME_POINT_EDGE)

  // 5. Nov 20 (Phase 4): subtract the B2B penalty from either team that
  //    played last night. Independent of HCA — a Hawks road B2B compounds
  //    both effects (away: -1.5 HCA, B2B: -1.5 → -3.0 total).
  const hawksPts = hawksPtsAfterHca - (hawksOnB2B ? B2B_POINT_PENALTY : 0)
  const oppPts   = oppPtsAfterHca   - (oppOnB2B   ? B2B_POINT_PENALTY : 0)

  // 6. Spread from the Hawks POV. Negative = Hawks favored.
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
