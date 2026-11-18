import { useEffect, useMemo, useState } from 'react'
import { uniqueGames, runSeason, carryOver, ratingHistoryByDate } from '../lib/elo'
import { predictGame } from '../lib/predictions'

const CURRENT_SEASON = '2026-27'
const PRIOR_SEASON   = '2025-26'
const HAWKS_TEAM_ID  = 1610612737

/**
 * UpcomingGamePrediction — team-level projection for a scheduled Hawks game.
 *
 * Renders four numbers (win prob, projected score, implied spread, implied
 * total) with a short disclosure line clarifying this is our ELO-based
 * projection, not a sportsbook line.
 *
 * Loads the same three files Rolling Power Rating uses, runs ELO through
 * prior + current season, then looks up both teams' current rating + pace
 * + Off/Def rating and hands them to predictGame() in lib/predictions.
 *
 * Future enhancement (Option B in claude/advanced-metrics-plan.md):
 * per-player projections (MIN/PTS/REB/AST) below this block.
 */
export default function UpcomingGamePrediction({ oppTricode, hawksAreHome }) {
  const [games25, setGames25] = useState(null)
  const [games26, setGames26] = useState(null)
  const [stats,   setStats]   = useState(null)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/league_team_games-${PRIOR_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_games-${CURRENT_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_stats-${CURRENT_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([g25, g26, s]) => {
        if (cancelled) return
        setGames25(g25?.games_by_team || null)
        setGames26(g26?.games_by_team || null)
        setStats(s || null)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const prediction = useMemo(() => {
    if (!games25 || !games26 || !stats) return null
    // Same chain as Rolling Power Rating so the two views stay consistent:
    // prior season full run -> 75% carryover -> walk current season.
    const final25 = runSeason(uniqueGames(games25), {})
    const start26 = carryOver(final25)
    const { finalRatings } = ratingHistoryByDate(uniqueGames(games26), start26)

    const hawksElo = finalRatings[HAWKS_TEAM_ID]
    const oppTeam  = stats.teams.find((t) => t.tricode === oppTricode)
    if (!oppTeam || hawksElo == null) return null
    const oppElo   = finalRatings[oppTeam.id]
    const hawksStats = stats.teams.find((t) => t.id === HAWKS_TEAM_ID)
    if (oppElo == null || !hawksStats) return null

    return predictGame({
      hawksElo,
      oppElo,
      hawksStats,
      oppStats: oppTeam,
      hawksAreHome,
    })
  }, [games25, games26, stats, oppTricode, hawksAreHome])

  // Silent on error / missing data — prediction block is optional context,
  // never a reason the whole upcoming-game page breaks.
  if (error || !prediction) return null

  const { winProb, hawksPts, oppPts, spread, total } = prediction
  const hawksFavored = spread < 0
  // Spread display: always from Hawks POV. Negative = Hawks favored.
  const spreadLabel = hawksFavored
    ? `ATL ${spread.toFixed(1)}`                      // "ATL -3.5"
    : `ATL +${Math.abs(spread).toFixed(1)}`           // "ATL +3.5"

  return (
    <section className="ugp-section" aria-label="Game prediction">
      <h3 className="ugp-title">Hawks Tracker projection</h3>
      <div className="ugp-tiles">
        <div className="ugp-tile">
          <div className="ugp-tile-label">Hawks win prob</div>
          <div className="ugp-tile-value">{Math.round(winProb * 100)}%</div>
        </div>
        <div className="ugp-tile">
          <div className="ugp-tile-label">Projected score</div>
          <div className="ugp-tile-value">
            {hawksAreHome
              ? `ATL ${hawksPts} — ${oppTricode} ${oppPts}`
              : `${oppTricode} ${oppPts} — ATL ${hawksPts}`}
          </div>
        </div>
        <div className="ugp-tile">
          <div className="ugp-tile-label">Spread</div>
          <div className="ugp-tile-value">{spreadLabel}</div>
        </div>
        <div className="ugp-tile">
          <div className="ugp-tile-label">Total</div>
          <div className="ugp-tile-value">O/U {total}</div>
        </div>
      </div>
      <p className="ugp-note">
        From our ELO + pace-adjusted team ratings. Not a betting line.
      </p>
    </section>
  )
}
