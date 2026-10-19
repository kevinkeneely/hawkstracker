import { useEffect, useLayoutEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import PlayerStatsPage from './pages/PlayerStatsPage'
import TeamStatsPage from './pages/TeamStatsPage'
import StandingsPage from './pages/StandingsPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import LeadersPage from './pages/LeadersPage'
import Footer from './components/Footer'
import BoxScorePage from './pages/BoxScorePage'

const HAWKS_TEAM_ID = 1610612737

function formatUpdatedAt(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

function App() {
  const [playerData, setPlayerData] = useState(null)
  const [teamData, setTeamData] = useState(null)
  const [standingsData, setStandingsData] = useState(null)
  const [leagueBaseline, setLeagueBaseline] = useState(null)
  const [leaderboards, setLeaderboards] = useState(null)
  const [error, setError] = useState(null)

    const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

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
        <div className="header-actions">
          <a
            href="https://x.com/KevinKeneely1"
            target="_blank"
            rel="noopener noreferrer"
            className="header-btn header-btn-x"
            aria-label="Follow @KevinKeneely1 on X"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            className="header-btn header-btn-theme"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <h1>Hawks Tracker</h1>
        <p>Atlanta Hawks {playerData?.season ?? '2025–26'} season dashboard</p>
        {leaderboards?.generated_at && (
          <p className="last-updated">Updated {formatUpdatedAt(leaderboards.generated_at)}</p>
        )}
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
            <Route path="/games/:id" element={<BoxScorePage />} />
          </Routes>
        )}
      </section>
      <Footer />
    </main>
  )
}

export default App