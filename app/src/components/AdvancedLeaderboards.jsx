/**
 * Hawks + League leaderboards for one toggle category on an Advanced page.
 *
 * Renders:
 *   - Hawks | League tab toggle (reuses .leaders-toggle pattern from LeadersPage)
 *   - Dropdown picker to select which specific stat to show
 *   - A single leaderboard table (top 10)
 *
 * Props:
 *   stats: array of { key, label, extract(player) → number|null, format(v) → string }
 *   hawksPlayers: array of Hawks player objects (from hawksData.players)
 *   leaguePlayers: array of league players (from the appropriate league JSON)
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const TOP_N = 10

export default function AdvancedLeaderboards({ stats, hawksPlayers, leaguePlayers, leagueMinMinutes }) {
  const [source, setSource] = useState('hawks')
  const [selectedKey, setSelectedKey] = useState(stats[0]?.key)
  const stat = stats.find(s => s.key === selectedKey) || stats[0]

  // IDs of players with a profile in this app — used to decide which
  // names in the table are clickable links to /players/:id. Set because
  // we check it per row on every render.
  const hawksIds = useMemo(
    () => new Set((hawksPlayers || []).map(p => p.id)),
    [hawksPlayers]
  )

  // Floor applies to the League tab only. Hawks are rotation players already;
  // the League pool can be noisy with low-minute players unless filtered.
  const players = source === 'league'
    ? (leagueMinMinutes != null
        ? leaguePlayers.filter(p => (p.min_total ?? 0) >= leagueMinMinutes)
        : leaguePlayers)
    : hawksPlayers

  const rows = useMemo(() => {
    if (!stat) return []
    return players
      .map(p => ({ p, value: stat.extract(p) }))
      .filter(row => row.value != null)
      .sort((a, b) => stat.lowerIsBetter ? a.value - b.value : b.value - a.value)
      .slice(0, TOP_N)
  }, [players, stat])

  if (!stat) return null

  return (
    <div className="adv-leaderboards">
      <div className="leaders-toggle">
        <button type="button"
                className={`leaders-toggle-btn ${source === 'hawks' ? 'active' : ''}`}
                onClick={() => setSource('hawks')}>
          Hawks
        </button>
        <button type="button"
                className={`leaders-toggle-btn ${source === 'league' ? 'active' : ''}`}
                onClick={() => setSource('league')}>
          League
        </button>
      </div>
      <div className="adv-leaderboards-picker">
        <select className="leader-select"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}>
          {stats.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>
      <section className="leader-card">
        <h3 className="leader-card-title">{stat.label}</h3>
        <table className="leader-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-player">Player</th>
              <th className="col-team">Team</th>
              <th className="col-pct">{stat.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.p.id}>
                <td className="col-rank">{i + 1}</td>
                <td className="col-player">
                  {hawksIds.has(row.p.id)
                    ? <Link to={`/players/${row.p.id}`} className="leader-player-link">{row.p.name}</Link>
                    : row.p.name}
                </td>
                <td className="col-team">{row.p.team || 'ATL'}</td>
                <td className="col-pct">{stat.format(row.value)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="leader-empty">No qualifying players.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
