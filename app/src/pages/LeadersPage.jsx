import { useMemo, useState } from 'react'

// Zones displayed on the Leaders page. The l_corner_3 / r_corner_3 split
// variants are available in the data but intentionally omitted here —
// corner 3s are a single leaderboard.
const ZONES = [
  { key: 'at_rim',        label: 'At the Rim',       short: 'At Rim' },
  { key: 'paint',         label: 'In the Paint',     short: 'Paint' },
  { key: 'mid',           label: 'Mid-Range',        short: 'Mid' },
  { key: 'corner_3',      label: 'Corner 3',         short: 'Corner 3' },
  { key: 'above_break_3', label: 'Above the Break 3', short: 'Above Break' },
]

const TOP_N = 10  // show top 10 per zone

export default function LeadersPage({ leaderboards }) {
  if (!leaderboards) {
    return (
      <div className="leaders-empty">
        <p>Leaderboards are being generated. Check back after the next data refresh.</p>
      </div>
    )
  }

  return (
    <div className="leaders-page">
      <header className="leaders-header">
        <h2>Shooting Leaders</h2>
        <p className="leaders-sub">
          Top {TOP_N} by FG% in each zone · minimum {leaderboards.min_gp} GP
        </p>
      </header>

      <div className="leaders-grid">
        {ZONES.map((zone) => (
          <ZoneLeaderboard
            key={zone.key}
            zone={zone}
            players={leaderboards.players}
            minFga={leaderboards.min_fga_per_zone[zone.key]}
          />
        ))}
      </div>
    </div>
  )
}

function ZoneLeaderboard({ zone, players, minFga }) {
  // Memoize so we don't re-sort 400+ players on every render
  const topPlayers = useMemo(() => {
    return players
      .filter((p) => {
        const z = p.zones[zone.key]
        return z && z.fga >= minFga && z.pct != null
      })
      .sort((a, b) => b.zones[zone.key].pct - a.zones[zone.key].pct)
      .slice(0, TOP_N)
  }, [players, zone.key, minFga])

  return (
    <section className="leader-card">
      <h3 className="leader-card-title">{zone.label}</h3>
      <p className="leader-card-sub">
        min {minFga} FGA
      </p>
      <table className="leader-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-player">Player</th>
            <th className="col-team">Team</th>
            <th className="col-pct">FG%</th>
            <th className="col-vol">M/A</th>
          </tr>
        </thead>
        <tbody>
          {topPlayers.map((p, i) => {
            const z = p.zones[zone.key]
            return (
              <tr key={p.id}>
                <td className="col-rank">{i + 1}</td>
                <td className="col-player">{p.name}</td>
                <td className="col-team">{p.team}</td>
                <td className="col-pct">{(z.pct * 100).toFixed(1)}%</td>
                <td className="col-vol">{z.fgm}/{z.fga}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}