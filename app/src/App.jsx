import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import PlayerStatsPage from './pages/PlayerStatsPage'
import TeamStatsPage from './pages/TeamStatsPage'
import StandingsPage from './pages/StandingsPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import LeadersPage from './pages/LeadersPage'

const HAWKS_TEAM_ID = 1610612737

function App() {
  const [playerData, setPlayerData] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [standingsData, setStandingsData] = useState(null)
  const [leagueBaseline, setLeagueBaseline] = useState(null)
  const [leaderboards, setLeaderboards] = useState(null)
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
      // Baseline is optional — profile page handles null gracefully if it's missing
      fetch('/league_shot_baseline.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Leaderboards file is optional — Leaders page handles null gracefully
      fetch('/league_leaderboards.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([players, teams, standings, baseline, lboards]) => {
        setPlayerData(players)
        setTeamData(teams)
        setStandingsData(standings)
        setLeagueBaseline(baseline)
        setLeaderboards(lboards)
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
          <NavLink to="/leaders" className="tab">Leaders</NavLink>
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
            <Route path="/leaders" element={<LeadersPage leaderboards={leaderboards} />} />
            <Route path="/players/:id" element={<PlayerProfilePage playerData={playerData} leagueBaseline={leagueBaseline} />} />
          </Routes>
        )}
      </section>
    </main>
  )
}

export default App