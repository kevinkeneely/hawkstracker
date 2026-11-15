import PlayerStatsTable from '../components/PlayerStatsTable'
import FormWatchRow from '../components/FormWatchRow'

export default function PlayerStatsPage({ playerData, gameLogs }) {
  return (
    <>
      <PlayerStatsTable players={playerData.players} />
      <FormWatchRow gameLogs={gameLogs} />
    </>
  )
}
