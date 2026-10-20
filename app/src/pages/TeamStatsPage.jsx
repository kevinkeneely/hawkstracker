import HeaderStats from '../components/HeaderStats'
import TeamStats from '../components/TeamStats'

export default function TeamStatsPage({ hawks, teamData }) {
  // Early in a season (and on the 2026-27 view before any games are played),
  // the stats endpoints return no team rows. Nothing to show.
  if (!hawks) {
    return (
      <p className="empty-state">
        Team stats will populate once the Hawks have played their first game.
      </p>
    )
  }
  return (
    <>
      <HeaderStats team={hawks} />
      <TeamStats team={hawks} allTeams={teamData.teams} />
    </>
  )
}