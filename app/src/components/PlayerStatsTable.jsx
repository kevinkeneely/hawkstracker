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
          {players.map((p, i) => {
            const faded = !p.qualified ? 'faded' : ''
            return (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>{p.age}</td>
                <td>{p.gp}</td>
                <td>{fmt(p.mpg)}</td>
                <PctileCell value={fmt(p.ppg)}      pctile={p.ppg_pctile}     faded={faded} />
                <PctileCell value={fmt(p.rpg)}      pctile={p.rpg_pctile}     faded={faded} />
                <PctileCell value={fmt(p.apg)}      pctile={p.apg_pctile}     faded={faded} />
                <PctileCell value={fmt(p.spg)}      pctile={p.spg_pctile}     faded={faded} />
                <PctileCell value={fmt(p.bpg)}      pctile={p.bpg_pctile}     faded={faded} />
                <td>{fmt(p.tov)}</td>
                <PctileCell value={pct(p.fg_pct)}   pctile={p.fg_pct_pctile}  faded={faded} />
                <PctileCell value={pct(p.fg3_pct)}  pctile={p.fg3_pct_pctile} faded={faded} />
                <PctileCell value={pct(p.ft_pct)}   pctile={p.ft_pct_pctile}  faded={faded} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A single colored cell. Background interpolates blue → gray → red by percentile.
function PctileCell({ value, pctile, faded }) {
  const bg = colorForPctile(pctile)
  const className = ['pctile-cell', faded].filter(Boolean).join(' ')
  return (
    <td className={className} style={{ backgroundColor: bg }}>
      {value}
    </td>
  )
}

// Linear interpolation from deep blue (0) through muted mid (0.5) to Torch Red (1).
// Returns a CSS rgb string, or 'transparent' when percentile is missing.
function colorForPctile(pctile) {
  if (pctile == null) return 'transparent'
  const BLUE = [63, 81, 181]    // 0th percentile
  const MID  = [138, 130, 144]  // 50th percentile
  const RED  = [200, 16, 46]    // 100th percentile (Hawks Torch Red)

  const [r1, g1, b1] = pctile <= 0.5 ? BLUE : MID
  const [r2, g2, b2] = pctile <= 0.5 ? MID  : RED
  const t = pctile <= 0.5 ? pctile * 2 : (pctile - 0.5) * 2

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function fmt(value) {
  if (value == null) return '—'
  return value.toFixed(1)
}

function pct(value) {
  if (value == null) return '—'
  return (value * 100).toFixed(1) + '%'
}