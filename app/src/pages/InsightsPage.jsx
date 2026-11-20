import MatchupPreview from '../components/MatchupPreview'
import RegressionCandidates from '../components/RegressionCandidates'
import FormWatchRow from '../components/FormWatchRow'
import PaceProjections from '../components/PaceProjections'
import MilestonesToWatch from '../components/MilestonesToWatch'

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
 *   Second row (≥900px, 50/50):
 *     - Regression Candidates table   — ranked Hawks + League tabs (left)
 *     - Form Watch                    — who's hot / cold vs season (right)
 *     Both stack to full-width columns below 900px for phones / narrow
 *     tablets, in source order (Regression first, Form Watch second).
 *
 *   Third row (full width):
 *     - Pace Projections — "on pace for X" cards per counting stat.
 *
 * Nov 19: moved Form Watch here from the Player Stats tab.
 * Nov 20: added Pace Projections as a third row.
 * Nov 20: added Milestones to Watch as a fourth row (career round numbers
 *         and personal bests on pace to be reached this season).
 *
 * Note: ELO (Rolling Power Rating) now lives on the home page next to
 * the point-differential chart, since both answer "how is the team
 * doing right now" at a glance.
 *
 * Two <RegressionCandidates /> instances share the same inputs; each
 * memoizes its own derivation, so the double-compute cost is small
 * (~500 player rows, no network).
 */
export default function InsightsPage({ playerData, leagueLeaderboards, gameLogs }) {
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
      <div className="insights-bottom-row">
        {hasRegression && (
          <RegressionCandidates
            hawksPlayers={playerData.players}
            leaguePlayers={leagueLeaderboards.players}
            view="table"
          />
        )}
        <FormWatchRow gameLogs={gameLogs} />
      </div>
      <PaceProjections />
      <MilestonesToWatch />
    </div>
  )
}
