import MatchupPreview from '../components/MatchupPreview'
import RegressionCandidates from '../components/RegressionCandidates'

/**
 * Insights — forward-looking, analytical stats that don't fit under
 * the player-centric Advanced tabs or the team-centric Standings.
 *
 * Current layout (see claude/advanced-metrics-plan.md for history):
 *
 *   Top row (≥900px, 70/30):
 *     - Regression Candidates scatter — Hawks players actual vs expected eFG%
 *     - Matchup Preview               — next game head-to-head
 *
 *   Full width below:
 *     - Regression Candidates table   — ranked Hawks + League tabs
 *
 * Note: ELO (Rolling Power Rating) now lives on the home page next to
 * the point-differential chart, since both answer "how is the team
 * doing right now" at a glance.
 *
 * Two <RegressionCandidates /> instances share the same inputs; each
 * memoizes its own derivation, so the double-compute cost is small
 * (~500 player rows, no network).
 */
export default function InsightsPage({ playerData, leagueLeaderboards }) {
  const hasRegression = playerData && leagueLeaderboards

  return (
    <div className="insights-page">
      <div className="insights-top-row">
        {hasRegression ? (
          <RegressionCandidates
            hawksPlayers={playerData.players}
            leaguePlayers={leagueLeaderboards.players}
            view="scatter"
          />
        ) : (
          <div />
        )}
        <MatchupPreview />
      </div>
      {hasRegression && (
        <RegressionCandidates
          hawksPlayers={playerData.players}
          leaguePlayers={leagueLeaderboards.players}
          view="table"
        />
      )}
    </div>
  )
}
