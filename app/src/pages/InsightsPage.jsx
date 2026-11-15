import RollingPowerRating from '../components/RollingPowerRating'
import MatchupPreview from '../components/MatchupPreview'
import RegressionCandidates from '../components/RegressionCandidates'

/**
 * Insights — forward-looking and analytical stats that don't fit neatly
 * under the player-centric Advanced tabs or the team-centric Standings.
 * Stacks three current features (see claude/advanced-metrics-plan.md):
 *
 *   1. Rolling Power Rating (ELO)   — team strength over time
 *   2. Matchup Preview              — next game's head-to-head
 *   3. Regression Candidates        — actual vs expected shooting
 *
 * Props: playerData + leagueLeaderboards are passed through for the
 * Regression Candidates section (Hawks + league tabs).
 */
export default function InsightsPage({ playerData, leagueLeaderboards }) {
  return (
    <div className="insights-page">
      <RollingPowerRating />
      <MatchupPreview />
      {playerData && leagueLeaderboards && (
        <RegressionCandidates
          hawksPlayers={playerData.players}
          leaguePlayers={leagueLeaderboards.players}
        />
      )}
    </div>
  )
}
