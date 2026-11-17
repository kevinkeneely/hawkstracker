import HeaderStats from '../components/HeaderStats'
import TeamStats from '../components/TeamStats'
import PointDifferentialChart from '../components/PointDifferentialChart'
import RollingPowerRating from '../components/RollingPowerRating'

// HomePage — default landing page at `/`.
//
// Layout (top to bottom):
//   1. Top row (50/50 on ≥420px wide, stacks below): ELO Power Rating +
//      Cumulative point differential. Both answer "how good is the team
//      right now" with a one-line chart, so they read as peers.
//   2. KPI tile strip: 4 columns × 2 rows on desktop, wraps to 2 × 4 on
//      mobile. See `.header-stats` in index.css for the breakpoints.
//   3. Team Stats, full width.
//
// Nov 17, 2026: ELO moved here from the Insights tab so the home page is
// the single "how is the team doing" snapshot. Insights now pairs the
// regression scatter with Matchup Preview above the regression table.
export default function HomePage({ hawks, teamData, season }) {
  // Early-season / empty-data fallback: before the Hawks have played a game,
  // the stats endpoints return no rows. Mirror TeamStatsPage's empty state so
  // the home page doesn't look broken on the first visit of the season.
  if (!hawks) {
    return (
      <p className="empty-state">
        The dashboard will populate once the Hawks have played their first game.
      </p>
    )
  }

  return (
    <>
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
        <section className="home-elo" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
          <RollingPowerRating />
        </section>
        <section className="home-point-diff" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
          <PointDifferentialChart season={season} />
        </section>
      </div>
      <section className="home-kpi" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
        <HeaderStats team={hawks} />
      </section>
      <section className="home-team-stats-full">
        <TeamStats team={hawks} allTeams={teamData.teams} />
      </section>
    </>
  )
}
