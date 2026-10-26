import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// Canonical sort keys (what the <th> click sends) mapped to the underlying
// field name for each display mode. Keeps the sort stable when the user
// flips Per Game ↔ Per 36 ↔ Totals: a sort by "pts" follows the user from
// ppg to ppg_p36 to pts_total.
function fieldForKey(key, mode) {
  if (key === 'gp')  return 'gp'
  if (key === 'min') return mode === 'totals' ? 'min_total' : 'mpg'
  if (mode === 'totals') {
    return {
      pts: 'pts_total', reb: 'reb_total', ast: 'ast_total',
      stl: 'stl_total', blk: 'blk_total', tov: 'tov_total',
      fg:  'fgm_total', fg3: 'fg3m_total', ft:  'ftm_total',
    }[key]
  }
  if (mode === 'per-36') {
    return {
      pts: 'ppg_p36', reb: 'rpg_p36', ast: 'apg_p36',
      stl: 'spg_p36', blk: 'bpg_p36', tov: 'tov_p36',
      fg:  'fg_pct',  fg3: 'fg3_pct', ft:  'ft_pct',
    }[key]
  }
  // per-game
  return {
    pts: 'ppg', reb: 'rpg', ast: 'apg',
    stl: 'spg', blk: 'bpg', tov: 'tov',
    fg:  'fg_pct', fg3: 'fg3_pct', ft:  'ft_pct',
  }[key]
}

export default function PlayerStatsTable({ players }) {
  const [mode, setMode] = useState('per-game') // 'per-game' | 'per-36' | 'totals'
  const [sortKey, setSortKey] = useState('min') // canonical key, see fieldForKey
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const suf = mode === 'per-36' ? '_p36' : ''

  // Clicking the active column flips direction; a new column resets to desc.
  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Qualified players sort first, then unqualified at the bottom (matches
  // Basketball Reference / NBA.com leaders behavior). Nulls always go last
  // regardless of direction so small-sample or missing values don't float up.
  const sortedPlayers = useMemo(() => {
    const field = fieldForKey(sortKey, mode)
    const dir = sortDir === 'desc' ? -1 : 1
    const cmp = (a, b) => {
      const av = a[field]
      const bv = b[field]
      const aNull = av == null
      const bNull = bv == null
      if (aNull && bNull) return 0
      if (aNull) return 1  // nulls to bottom
      if (bNull) return -1
      return (av - bv) * dir
    }
    const qualified = players.filter(p => p.qualified)
    const unqualified = players.filter(p => !p.qualified)
    qualified.sort(cmp)
    unqualified.sort(cmp)
    return [...qualified, ...unqualified]
  }, [players, sortKey, sortDir, mode])

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
              <SortableTh k="gp"  label="GP" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="min" label={mode === 'totals' ? 'MIN' : 'MPG'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="pts" label={mode === 'per-game' ? 'PPG' : 'PTS'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="reb" label={mode === 'per-game' ? 'RPG' : 'REB'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="ast" label={mode === 'per-game' ? 'APG' : 'AST'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="stl" label={mode === 'per-game' ? 'SPG' : 'STL'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="blk" label={mode === 'per-game' ? 'BPG' : 'BLK'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="tov" label="TOV" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="fg"  label={mode === 'totals' ? 'FGM' : 'FG%'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="fg3" label={mode === 'totals' ? '3PM' : '3P%'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
              <SortableTh k="ft"  label={mode === 'totals' ? 'FTM' : 'FT%'} activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p, i) => {
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

// Clickable column header. Shows ▲/▼ next to the label when this column is
// the active sort. Minimal inline style so no CSS file changes are needed;
// add a `.sortable-th:hover` rule later if you want a hover affordance.
function SortableTh({ k, label, activeKey, activeDir, onSort }) {
  const isActive = k === activeKey
  const arrow = isActive ? (activeDir === 'desc' ? ' ▼' : ' ▲') : ''
  return (
    <th
      className="sortable-th"
      onClick={() => onSort(k)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {label}{arrow}
    </th>
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
