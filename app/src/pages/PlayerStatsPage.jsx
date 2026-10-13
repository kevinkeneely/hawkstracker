import PlayerStatsTable from '../components/PlayerStatsTable'

export default function PlayerStatsPage({ playerData }) {
  return <PlayerStatsTable players={playerData.players} />
}