import { useEffect, useLayoutEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import PlayerStatsPage from './pages/PlayerStatsPage'
import TeamStatsPage from './pages/TeamStatsPage'
import StandingsPage from './pages/StandingsPage'
import PlayerProfilePage from './pages/PlayerProfilePage'
import LeadersPage from './pages/LeadersPage'
import Footer from './components/Footer'
import BoxScorePage from './pages/BoxScorePage'
import ChartsPage from './pages/ChartsPage'
import ComparePage from './pages/ComparePage'
import { Analytics } from '@vercel/analytics/react'

const HAWKS_TEAM_ID = 1610612737

// Seasons the dashboard knows about. Add new strings here when a season ends
// and before the next one starts. The order controls dropdown order (newest
// first). To be a valid value for state, URL, or localStorage.
const SEASONS = ['2026-27', '2025-26']
const CURRENT_SEASON = SEASONS[0]
const isValidSeason = (s) => SEASONS.includes(s)

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
  const [season, setSeason] = useState(null) // null = still deciding default
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

  // Resolve the season on first mount:
  //   1. ?season=... URL param wins (shareable deep links).
  //   2. localStorage next (sticky across visits).
  //   3. Smart default: peek at the current season's hawksData. If it's empty
  //      (early-season), fall back to the most recent completed season.
  useEffect(() => {
    const urlSeason = new URLSearchParams(window.location.search).get('season')
    if (isValidSeason(urlSeason)) { setSeason(urlSeason); return }

    let stored = null
    try { stored = localStorage.getItem('season') } catch {}
    if (isValidSeason(stored)) { setSeason(stored); return }

    fetch(`/hawksData-${CURRENT_SEASON}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSeason(d?.players?.length ? CURRENT_SEASON : SEASONS[1]))
      .catch(() => setSeason(SEASONS[1]))
  }, [])

  // When the user picks a different season, write it to URL + localStorage so
  // the choice sticks and is shareable. Guarded on `season` so this doesn't
  // fire with the initial `null`.
  useEffect(() => {
    if (!season) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('season') !== season) {
      url.searchParams.set('season', season)
      window.history.replaceState({}, '', url)
    }
    try { localStorage.setItem('season', season) } catch {}
  }, [season])

  // Load (or re-load) the five data files whenever season changes. Clears the
  // previous season's data first so the UI shows "Loading…" during the switch
  // rather than momentarily mixing seasons.
  useEffect(() => {
    if (!season) return
    setPlayerData(null)
    setTeamData(null)
    setStandingsData(null)
    setLeagueBaseline(null)
    setLeaderboards(null)
    setError(null)

    Promise.all([
      fetch(`/hawksData-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load hawksData-${season}.json (${r.status})`)
        return r.json()
      }),
      fetch(`/teamStatsData-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load teamStatsData-${season}.json (${r.status})`)
        return r.json()
      }),
      fetch(`/standingsData-${season}.json`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load standingsData-${season}.json (${r.status})`)
        return r.json()
      }),
      // Baseline is optional — profile page handles null gracefully if it's missing
      fetch(`/league_shot_baseline-${season}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Leaderboards file is optional — Leaders page handles null gracefully
      fetch(`/league_leaderboards-${season}.json`)
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
  }, [season])

  const hawks = teamData?.teams.find((t) => t.id === HAWKS_TEAM_ID)
  // Team Stats needs `hawks`, but every other tab works without it, so we
  // keep hawks optional and let TeamStatsPage render its own empty state.
  const loaded = season && playerData && teamData && standingsData

  return (
    <main>
      <header>
        <div className="header-actions">
          <select
            value={season ?? CURRENT_SEASON}
            onChange={(e) => setSeason(e.target.value)}
            className="header-btn header-btn-season"
            aria-label="Select season"
            disabled={!season}
          >
            {SEASONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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
        <p>Atlanta Hawks {playerData?.season ?? season ?? '2025–26'} season dashboard</p>
        {leaderboards?.generated_at && (
          <p className="last-updated">Updated {formatUpdatedAt(leaderboards.generated_at)}</p>
        )}
        <nav className="tabs">
          <NavLink to="/players" className="tab">Player Stats</NavLink>
          <NavLink to="/team" className="tab">Team Stats</NavLink>
          <NavLink to="/standings" className="tab">Standings</NavLink>
          <NavLink to="/leaders" className="tab">Leaders</NavLink>
          <NavLink to="/charts" className="tab">Scatter Plots</NavLink>
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
            <Route path="/standings" element={<StandingsPage standingsData={standingsData} season={season} />} />
            <Route path="/leaders" element={<LeadersPage leaderboards={leaderboards} playerData={playerData} />} />
            <Route path="/charts" element={<ChartsPage playerData={playerData} leaderboards={leaderboards} />} />
            <Route path="/players/:id" element={<PlayerProfilePage playerData={playerData} season={season} leagueBaseline={leagueBaseline} />} />
            <Route path="/compare/:id1/:id2" element={<ComparePage playerData={playerData} />} />
            <Route path="/games/:id" element={<BoxScorePage season={season} />} />
          </Routes>
        )}
      </section>
      <Footer />
      <Analytics />
    </main>
  )
}

export default App
