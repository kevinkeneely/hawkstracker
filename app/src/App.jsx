import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import PlayerStatsPage from './pages/PlayerStatsPage'
import TeamStatsPage from './pages/TeamStatsPage'
import StandingsPage from './pages/StandingsPage'

const HAWKS_TEAM_ID = 1610612737

function App() {
  const [playerData, setPlayerData] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [standingsData, setStandingsData] = useState(null)
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
      fetch('/standingsData.json').then((r) => {
        if (!r.ok) throw new Error(`Failed to load standingsData.json (${r.status})`)
        return r.json()
      }),
    ])
      .then(([players, teams, standings]) => {
        setPlayerData(players)
        setTeamData(teams)
        setStandingsData(standings)
      })
      .catch((err) => setError(err.message))
  }, [])

  const hawks = teamData?.teams.find((t) => t.id === HAWKS_TEAM_ID)
  const loaded = playerData && teamData && standingsData && hawks

  return (
    <main>
      <header>
        <h1>Hawks Tracker</h1>
        <p>Atlanta Hawks {playerData?.season ?? '2025–26'} season dashboard</p>
        <nav className="tabs">
          <NavLink to="/players" className="tab">Player Stats</NavLink>
          <NavLink to="/team" className="tab">Team Stats</NavLink>
          <NavLink to="/standings" className="tab">Standings</NavLink>
        </nav>
      </header>
      <section>
        {error && <p>Error: {error}</p>}
        {!error && !loaded && <p>Loading…</p>}
        {loaded && (
          <Routes>
            <Route path="/" element={<Navigate to="/players" replace />} />
            <Route path="/players" element={<PlayerStatsPage playerData={playerData} />} />
            <Route path="/team" element={<TeamStatsPage hawks={hawks} teamData={teamData} />} />
            <Route path="/standings" element={<StandingsPage standingsData={standingsData} />} />
          </Routes>
        )}
      </section>
    </main>
  )
}

export default App