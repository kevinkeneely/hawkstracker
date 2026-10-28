import HeaderStats from '../components/HeaderStats'
import TeamStats from '../components/TeamStats'
import PointDifferentialChart from '../components/PointDifferentialChart'

// HomePage — default landing page at `/`.
//
// Layout uses CSS grid with `auto-fit` + `minmax`: as many columns as fit
// at ≥420px wide, each flexing up to 1fr. One child fills the row; two
// children sit side-by-side on wide screens and stack on narrow. Adding
// a third block later just drops in — no layout rewrite needed.
//
// Phase 2 (Oct 27, 2026): Team Stats moved onto this page, full-size for
// now. Phase 5 adds a point-differential chart next to it. Phase 6 compacts
// the Team Stats cards so both fit cleanly side-by-side without scroll.
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
      <section className="home-team-stats" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
        <HeaderStats team={hawks} />
        <TeamStats team={hawks} allTeams={teamData.teams} />
      </section>
      <section className="home-point-diff" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
        <PointDifferentialChart season={season} />
      </section>
    </div>
  )
}
