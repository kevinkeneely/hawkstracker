import PlayerStatsTable from '../components/PlayerStatsTable'

// Nov 19: FormWatchRow moved to the Insights tab where it now sits
// side-by-side with the Regression Candidates table (50/50 on desktop,
// stacked on mobile). This page is just the Player Stats table now.
export default function PlayerStatsPage({ playerData }) {
  return <PlayerStatsTable players={playerData.players} />
}
