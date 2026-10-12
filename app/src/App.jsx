import { useEffect, useState } from 'react'
import PlayerStatsTable from './components/PlayerStatsTable'
import HeaderStats from './components/HeaderStats'

const HAWKS_TEAM_ID = 1610612737

function App() {
  const [playerData, setPlayerData] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/hawksData.json').then((r) => {
        if (!r.ok) throw new Error(`Failed to load hawksData.json (${r.status})`)
        return r.json()
      }),
      fetch('/teamStatsData.json').then((r) => {
        if (!r.ok) throw new Error(`Failed to load teamStatsData.json (${r.status})`)
        return r.json()
      }),
    ])
      .then(([players, teams]) => {
        setPlayerData(players)
        setTeamData(teams)
      })
      .catch((err) => setError(err.message))
  }, [])

  const hawks = teamData?.teams.find((t) => t.id === HAWKS_TEAM_ID)
  const loaded = playerData && teamData && hawks

  return (
    <main>
      <header>
        <h1>Hawks Tracker</h1>
        <p>Atlanta Hawks {playerData?.season ?? '2025–26'} season dashboard</p>
      </header>
      <section>
        {error && <p>Error: {error}</p>}
        {!error && !loaded && <p>Loading…</p>}
        {loaded && (
          <>
            <HeaderStats team={hawks} />
            <PlayerStatsTable players={playerData.players} />
          </>
        )}
      </section>
    </main>
  )
}

export default App
