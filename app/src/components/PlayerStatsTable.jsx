export default function PlayerStatsTable({ players }) {
  return (
    <div className="table-wrap">
      <table className="player-stats">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Age</th>
            <th>GP</th>
            <th>MPG</th>
            <th>PPG</th>
            <th>RPG</th>
            <th>APG</th>
            <th>SPG</th>
            <th>BPG</th>
            <th>TOV</th>
            <th>FG%</th>
            <th>3P%</th>
            <th>FT%</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td>{p.name}</td>
              <td>{p.age}</td>
              <td>{p.gp}</td>
              <td>{fmt(p.mpg)}</td>
              <td>{fmt(p.ppg)}</td>
              <td>{fmt(p.rpg)}</td>
              <td>{fmt(p.apg)}</td>
              <td>{fmt(p.spg)}</td>
              <td>{fmt(p.bpg)}</td>
              <td>{fmt(p.tov)}</td>
              <td>{pct(p.fg_pct)}</td>
              <td>{pct(p.fg3_pct)}</td>
              <td>{pct(p.ft_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Format a decimal average (e.g. 22.47 → "22.5"); show "—" if missing.
function fmt(value) {
  if (value == null) return '—'
  return value.toFixed(1)
}

// Format a decimal percentage (e.g. 0.457 → "45.7%"); show "—" if missing.
function pct(value) {
  if (value == null) return '—'
  return (value * 100).toFixed(1) + '%'
}