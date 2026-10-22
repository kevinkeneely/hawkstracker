import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function PlayerStatsTable({ players }) {
  const [mode, setMode] = useState('per-game') // 'per-game' | 'per-36' | 'totals'
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
        <button
          className={`stats-mode-btn ${mode === 'totals' ? 'active' : ''}`}
          onClick={() => setMode('totals')}
        >
          Totals
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
              <th>{mode === 'totals' ? 'MIN' : 'MPG'}</th>
              <th>{mode === 'per-game' ? 'PPG' : 'PTS'}</th>
              <th>{mode === 'per-game' ? 'RPG' : 'REB'}</th>
              <th>{mode === 'per-game' ? 'APG' : 'AST'}</th>
              <th>{mode === 'per-game' ? 'SPG' : 'STL'}</th>
              <th>{mode === 'per-game' ? 'BPG' : 'BLK'}</th>
              <th>TOV</th>
              <th>{mode === 'totals' ? 'FGM' : 'FG%'}</th>
              <th>{mode === 'totals' ? '3PM' : '3P%'}</th>
              <th>{mode === 'totals' ? 'FTM' : 'FT%'}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => {
              const faded = !p.qualified ? 'faded' : ''
              if (mode === 'totals') {
                return (
                  <tr key={p.id} className={faded}>
                    <td>{i + 1}</td>
                    <td><Link to={`/players/${p.id}`} className="player-link">{p.name}</Link></td>
                    <td>{p.age}</td>
                    <td>{p.gp}</td>
                    <td>{num(p.min_total)}</td>
                    <td>{num(p.pts_total)}</td>
                    <td>{num(p.reb_total)}</td>
                    <td>{num(p.ast_total)}</td>
                    <td>{num(p.stl_total)}</td>
                    <td>{num(p.blk_total)}</td>
                    <td>{num(p.tov_total)}</td>
                    <td>{num(p.fgm_total)}</td>
                    <td>{num(p.fg3m_total)}</td>
                    <td>{num(p.ftm_total)}</td>
                  </tr>
                )
              }
              return (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td><Link to={`/players/${p.id}`} className="player-link">{p.name}</Link></td>
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

// Season total → integer with thousands separators. Minutes come as decimals
// from NBA.com (e.g. 2531.59) so we round first.
function num(value) {
  if (value == null) return '—'
  return Math.round(value).toLocaleString()
}
