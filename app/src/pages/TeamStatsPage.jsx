import HeaderStats from '../components/HeaderStats'
import TeamStats from '../components/TeamStats'

export default function TeamStatsPage({ hawks, teamData }) {
  return (
    <>
      <HeaderStats team={hawks} />
      <TeamStats team={hawks} allTeams={teamData.teams} />
    </>
  )
}