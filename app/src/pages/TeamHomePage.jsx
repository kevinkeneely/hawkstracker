import { useParams, Link } from 'react-router-dom'
import HeaderStats from '../components/HeaderStats'
import TeamStats from '../components/TeamStats'
import PointDifferentialChart from '../components/PointDifferentialChart'

/**
 * TeamHomePage — identical layout to the Hawks `/` home page, but for any
 * team. Reachable at `/teams/:tricode` (e.g. /teams/BOS) from the Standings
 * tab. The ATL page here mirrors `/`, so this route works for the Hawks too.
 *
 * URL slug is the 3-letter tricode (ATL, BOS, LAL, …). We resolve it by
 * walking standingsData (which has `abbr` + `team_id`), then look the team
 * up in TeamStatsData by id.
 *
 * Point Differential chart: Hawks-only right now because schedule-{season}.json
 * only has Hawks games. Non-Hawks teams render a placeholder card. A future
 * enhancement (see claude/post-launch-followups.md) could add per-team
 * schedule data so every team's chart renders live.
 *
 * NOTE: the top-level tabs (Player Stats, Standings, Leaders, Advanced)
 * remain Hawks-focused everywhere by design. If we later want them to
 * reflect the selected team (e.g. BOS's player stats on /teams/BOS), that's
 * a much bigger lift — see the followup doc.
 */
export default function TeamHomePage({ teamData, standingsData, season }) {
  const { tricode } = useParams()
  const upper = (tricode || '').toUpperCase()

  if (!teamData || !standingsData) {
    return <p className="empty-state">Loading…</p>
  }

  // Resolve tricode → team_id via standings, then stats via TeamStatsData.
  const allStandings = [...(standingsData.east || []), ...(standingsData.west || [])]
  const standingsRow = allStandings.find((t) => t.abbr === upper)
  if (!standingsRow) {
    return (
      <div className="empty-state">
        <p>Unknown team: <code>{tricode}</code>.</p>
        <p><Link to="/standings">← Back to Standings</Link></p>
      </div>
    )
  }

  const team = teamData.teams.find((t) => t.id === standingsRow.team_id)
  if (!team) {
    return (
      <div className="empty-state">
        <p>Stats not available yet for {standingsRow.name}.</p>
        <p><Link to="/standings">← Back to Standings</Link></p>
      </div>
    )
  }

  const isHawks = upper === 'ATL'

  return (
    <>
      <div className="team-home-header">
        <Link to="/standings" className="team-home-back">← Back to Standings</Link>
        <h2 className="team-home-name">{standingsRow.name}</h2>
      </div>

      <div
        className="home-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: '1.5rem',
          padding: '1rem 0',
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <section className="home-kpi" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
          <HeaderStats team={team} />
        </section>
        <section className="home-point-diff" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
          {isHawks ? (
            <PointDifferentialChart season={season} />
          ) : (
            <div className="team-home-chart-placeholder">
              <h3>Point Differential</h3>
              <p>
                Cumulative point differential chart is only available for the Hawks right now.
                Coming soon for all teams.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="home-team-stats-full">
        <TeamStats team={team} allTeams={teamData.teams} />
      </section>
    </>
  )
}
