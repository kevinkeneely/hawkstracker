import { useState } from 'react'

export default function PlayerStatsTable({ players }) {
  const [mode, setMode] = useState('per-game') // 'per-game' | 'per-36'
  const suf = mode === 'per-36' ? '_p36' : ''

  return (
    <div>
      <div className="stats-mode-toggle">
        <button
          className={`stats-mode-btn ${mode === 'per-game' ? 'active' : ''}`}
          onClick={() => setMode('per-game')}
        >
          Per Game
        </button>
        <button
          className={`stats-mode-btn ${mode === 'per-36' ? 'active' : ''}`}
          onClick={() => setMode('per-36')}
        >
          Per 36
        </button>
      </div>

      <div className="table-wrap">
        <table className="player-stats">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Age</th>
              <th>GP</th>
              <th>MPG</th>
              <th>{mode === 'per-36' ? 'PTS' : 'PPG'}</th>
              <th>{mode === 'per-36' ? 'REB' : 'RPG'}</th>
              <th>{mode === 'per-36' ? 'AST' : 'APG'}</th>
              <th>{mode === 'per-36' ? 'STL' : 'SPG'}</th>
              <th>{mode === 'per-36' ? 'BLK' : 'BPG'}</th>
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
                  <PctileCell value={fmt(p[`ppg${suf}`])} pctile={p[`ppg${suf}_pctile`]} faded={faded} />
                  <PctileCell value={fmt(p[`rpg${suf}`])} pctile={p[`rpg${suf}_pctile`]} faded={faded} />
                  <PctileCell value={fmt(p[`apg${suf}`])} pctile={p[`apg${suf}_pctile`]} faded={faded} />
                  <PctileCell value={fmt(p[`spg${suf}`])} pctile={p[`spg${suf}_pctile`]} faded={faded} />
                  <PctileCell value={fmt(p[`bpg${suf}`])} pctile={p[`bpg${suf}_pctile`]} faded={faded} />
                  <PctileCell value={fmt(p[`tov${suf}`])} pctile={p[`tov${suf}_pctile`]} faded={faded} invert />
                  <PctileCell value={pct(p.fg_pct)}  pctile={p.fg_pct_pctile}  faded={faded} />
                  <PctileCell value={pct(p.fg3_pct)} pctile={p.fg3_pct_pctile} faded={faded} />
                  <PctileCell value={pct(p.ft_pct)}  pctile={p.ft_pct_pctile}  faded={faded} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// A single colored cell. `invert` flips the gradient (used for TOV where
// lower is better: low TOV = Torch Red, high TOV = blue).
function PctileCell({ value, pctile, faded, invert = false }) {
  const colorPctile = invert && pctile != null ? 1 - pctile : pctile
  const bg = colorForPctile(colorPctile)
  const className = ['pctile-cell', faded].filter(Boolean).join(' ')
  return (
    <td className={className} style={{ backgroundColor: bg }}>
      {value}
    </td>
  )
}

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