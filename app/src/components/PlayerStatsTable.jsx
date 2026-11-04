import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// Canonical sort keys (what the <th> click sends) mapped to the underlying
// field name for each display mode. Keeps the sort stable when the user
// flips Per Game ↔ Per 36 ↔ Totals: a sort by "pts" follows the user from
// ppg to ppg_p36 to pts_total.
function fieldForKey(key, mode) {
  if (key === 'gp')  return 'gp'
  if (key === 'min') return (mode === 'totals' || mode === 'advanced') ? 'min_total' : 'mpg'
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

// Advanced stats view — 10 columns in 3 sections, Hawks-red divider
// columns separating them. Each column carries its own value+pctile
// extractor so stats living in nested blocks (shooting_tracking,
// defense_tracking) sit alongside flat ones (ast_pct) in one list.
// `invert: true` flips the color gradient for stats where lower = better
// (TOV%, DFG% Allowed, DFG+/- vs Norm).
const ADVANCED_SECTIONS = [
  {
    name: 'Overall Efficiency',
    cols: [
      { key: 'reb_pct',  label: 'REB%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.reb_pct,  pctile: (p) => p.reb_pct_pctile },
      { key: 'ast_pct',  label: 'AST%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.ast_pct,  pctile: (p) => p.ast_pct_pctile },
      { key: 'tov_pct',  label: 'TOV%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.tov_pct,  pctile: (p) => p.tov_pct_pctile, invert: true },
      { key: 'efg_pct',  label: 'eFG%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.efg_pct,  pctile: (p) => p.efg_pct_pctile },
      { key: 'ts_pct',   label: 'TS%',  format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.ts_pct,   pctile: (p) => p.ts_pct_pctile },
      { key: 'fta_rate', label: 'FTr',  format: (v) => (v == null ? '—' : v.toFixed(3)),
        extract: (p) => p.fta_rate, pctile: (p) => p.fta_rate_pctile },
    ],
  },
  {
    name: 'Shooting',
    cols: [
      { key: 'cs_fg3_pct', label: 'C&S 3P%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.shooting_tracking?.cs?.fg3_pct?.value,
        pctile:  (p) => p.shooting_tracking?.cs?.fg3_pct?.pctile },
      { key: 'pu_fg3_pct', label: 'Pull-Up 3P%', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.shooting_tracking?.pullup?.fg3_pct?.value,
        pctile:  (p) => p.shooting_tracking?.pullup?.fg3_pct?.pctile },
    ],
  },
  {
    name: 'Defense',
    cols: [
      { key: 'd_fg_pct', label: 'DFG% Allowed', format: (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'),
        extract: (p) => p.defense_tracking?.d_fg_pct?.value,
        pctile:  (p) => p.defense_tracking?.d_fg_pct?.pctile, invert: true },
      { key: 'd_plusminus', label: 'DFG+/- vs Norm',
        format: (v) => { if (v == null) return '—'; const n = v * 100; return (n > 0 ? '+' : '') + n.toFixed(1) + '%' },
        extract: (p) => p.defense_tracking?.pct_plusminus?.value,
        pctile:  (p) => p.defense_tracking?.pct_plusminus?.pctile, invert: true },
    ],
  },
]
// Flat list of all advanced columns, used for sort-key lookup.
const ADVANCED_COLS_FLAT = ADVANCED_SECTIONS.flatMap((s) => s.cols)

// Glossary rendered in a collapsible section below the Advanced table.
// Wording follows the official NBA.com / Basketball Reference conventions
// where possible. Reuses the .boxscore-glossary* styles from the box-score
// advanced tabs so the two glossaries look and feel the same.
const PLAYER_ADVANCED_GLOSSARY = [
  { label: 'REB% (Rebound Percentage)',
    def: 'Estimate of the percentage of available rebounds a player grabbed while on the floor.',
    formula: '100 × (REB × (Tm MP ÷ 5)) ÷ (MP × (Tm REB + Opp REB))' },
  { label: 'AST% (Assist Percentage)',
    def: 'Estimate of the percentage of teammate field goals a player assisted while on the floor.',
    formula: '100 × AST ÷ (((MP ÷ (Tm MP ÷ 5)) × Tm FGM) − FGM)' },
  { label: 'STL% (Steal Percentage)',
    def: 'Estimate of the percentage of opponent possessions that end with a steal by this player while on the floor.',
    formula: '100 × (STL × (Tm MP ÷ 5)) ÷ (MP × Opp Poss)' },
  { label: 'BLK% (Block Percentage)',
    def: 'Estimate of the percentage of opponent two-point field goal attempts blocked by this player while on the floor.',
    formula: '100 × (BLK × (Tm MP ÷ 5)) ÷ (MP × (Opp FGA − Opp 3PA))' },
  { label: 'TOV% (Turnover Percentage)',
    def: 'Estimate of turnovers committed per 100 plays. Lower is better.',
    formula: '100 × TOV ÷ (FGA + 0.44 × FTA + TOV)' },
  { label: 'eFG% (Effective Field Goal Percentage)',
    def: 'Field goal percentage adjusted for the fact that a made 3-pointer is worth more than a made 2-pointer.',
    formula: '(FGM + 0.5 × 3PM) ÷ FGA' },
  { label: 'TS% (True Shooting Percentage)',
    def: 'Shooting efficiency that accounts for 2-point, 3-point, and free throws in one number.',
    formula: 'PTS ÷ (2 × (FGA + 0.44 × FTA))' },
  { label: 'FTr (Free Throw Rate)',
    def: 'How often a player gets to the free throw line relative to their field goal attempts.',
    formula: 'FTA ÷ FGA' },
  { label: 'C&S 3P% (Catch & Shoot 3P%)',
    def: '3-point percentage on catch-and-shoot attempts — jumpers with no dribble before the shot.' },
  { label: 'Pull-Up 3P%',
    def: '3-point percentage on pull-up attempts — jumpers taken off the dribble (one or more dribbles before the shot).' },
  { label: 'DFG% Allowed (Defensive Field Goal %)',
    def: 'Field goal percentage opponents shot while being defended by this player. Lower is better.',
    formula: 'Matchup FGM ÷ Matchup FGA' },
  { label: 'DFG+/- vs Norm',
    def: 'Difference between the FG% opponents shot against this defender and their season-average FG%. Negative means the defender held opponents below their norm (good defense); positive means opponents shot better than usual (bad defense).',
    formula: 'DFG% − Opponent\'s Season FG%' },
]


export default function PlayerStatsTable({ players }) {
  const [mode, setMode] = useState('per-game') // 'per-game' | 'per-36' | 'totals' | 'advanced'
  const [sortKey, setSortKey] = useState('min') // canonical key, see fieldForKey
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'
  const suf = mode === 'per-36' ? '_p36' : ''
  // Percentile badges render on Per Game and Per 36 (pipeline computes a
  // parallel league-wide Per-36 pool for counting stats: ppg_p36_pctile,
  // rpg_p36_pctile, etc.). Totals doesn't yet have a comparable per-season
  // pool, so badges stay hidden there. Advanced has its own path and shows
  // badges independently of this flag.
  const showPctile = mode === 'per-game' || mode === 'per-36'

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
    // Advanced columns live in nested blocks; resolve via their extractor.
    // Classic modes use the direct field lookup from fieldForKey.
    const advCol = mode === 'advanced'
      ? ADVANCED_COLS_FLAT.find((c) => c.key === sortKey)
      : null
    const field = advCol ? null : fieldForKey(sortKey, mode)
    const getVal = advCol ? advCol.extract : (p) => p[field]
    const dir = sortDir === 'desc' ? -1 : 1
    const cmp = (a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
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
          onClick={() => {
            setMode('per-game')
            if (ADVANCED_COLS_FLAT.some((c) => c.key === sortKey)) {
              setSortKey('min')
              setSortDir('desc')
            }
          }}
        >
          Per Game
        </button>
        <button
          className={`stats-mode-btn ${mode === 'per-36' ? 'active' : ''}`}
          onClick={() => {
            setMode('per-36')
            if (ADVANCED_COLS_FLAT.some((c) => c.key === sortKey)) {
              setSortKey('min')
              setSortDir('desc')
            }
          }}
        >
          Per 36
        </button>
        <button
          className={`stats-mode-btn ${mode === 'totals' ? 'active' : ''}`}
          onClick={() => {
            setMode('totals')
            if (ADVANCED_COLS_FLAT.some((c) => c.key === sortKey)) {
              setSortKey('min')
              setSortDir('desc')
            }
          }}
        >
          Totals
        </button>
        <button
          className={`stats-mode-btn ${mode === 'advanced' ? 'active' : ''}`}
          onClick={() => {
            setMode('advanced')
            // Default sort when entering Advanced: total minutes played,
            // descending. Rotation players surface at the top.
            setSortKey('min')
            setSortDir('desc')
          }}
        >
          Advanced
        </button>
      </div>

      {mode === 'advanced' && (
        <>
          <div className="pctile-legend">
            <div className="pctile-legend-gradient">
              <div className="pctile-legend-bar" aria-hidden="true"></div>
              <div className="pctile-legend-labels">
                <span className="pctile-legend-label">Worst</span>
                <span className="pctile-legend-label">League avg</span>
                <span className="pctile-legend-label">Best</span>
              </div>
            </div>
            <div className="pctile-legend-note">
              <span className="pctile-legend-num-highlight">Number</span> under each stat is the player's league-wide percentile rank (0-100). Higher = better.
            </div>
          </div>
          <div className="table-wrap">
            <table className="player-stats player-stats-advanced">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <SortableTh k="min" label="MIN" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
                  {ADVANCED_SECTIONS.map((section, si) => (
                    <Fragment key={section.name}>
                      {section.cols.map((col) => (
                        <SortableTh
                          key={col.key}
                          k={col.key}
                          label={col.label}
                          activeKey={sortKey}
                          activeDir={sortDir}
                          onSort={handleSort}
                        />
                      ))}
                      {si < ADVANCED_SECTIONS.length - 1 && (
                        <th className="adv-section-divider" aria-hidden="true"></th>
                      )}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p, i) => {
                  const faded = !p.qualified ? 'faded' : ''
                  return (
                    <tr key={p.id} className={faded}>
                      <td>{i + 1}</td>
                      <td><Link to={`/players/${p.id}`} className="player-link">{p.name}</Link></td>
                      <td>{num(p.min_total)}</td>
                      {ADVANCED_SECTIONS.map((section, si) => (
                        <Fragment key={section.name}>
                          {section.cols.map((col) => {
                            const value = col.extract(p)
                            const pctile = col.pctile(p)
                            return (
                              <PctileCell
                                key={col.key}
                                value={col.format(value)}
                                pctile={pctile}
                                faded={faded}
                                invert={!!col.invert}
                                showPctile={true}
                              />
                            )
                          })}
                          {si < ADVANCED_SECTIONS.length - 1 && (
                            <td className="adv-section-divider" aria-hidden="true"></td>
                          )}
                        </Fragment>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <details className="boxscore-glossary">
            <summary className="boxscore-glossary-summary">
              Glossary — what do these stats mean?
            </summary>
            <dl className="boxscore-glossary-list">
              {PLAYER_ADVANCED_GLOSSARY.map((e) => (
                <div key={e.label} className="boxscore-glossary-item">
                  <dt className="boxscore-glossary-term">{e.label}</dt>
                  <dd className="boxscore-glossary-def">{e.def}</dd>
                  {e.formula && (
                    <dd className="boxscore-glossary-formula">
                      <span className="boxscore-glossary-formula-label">Formula:</span>{' '}
                      {e.formula}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </details>
        </>
      )}

      {mode !== 'advanced' && showPctile && (
        <div className="pctile-legend">
          <div className="pctile-legend-gradient">
            <div className="pctile-legend-bar" aria-hidden="true"></div>
            <div className="pctile-legend-labels">
              <span className="pctile-legend-label">Worst</span>
              <span className="pctile-legend-label">League avg</span>
              <span className="pctile-legend-label">Best</span>
            </div>
          </div>
          <div className="pctile-legend-note">
            <span className="pctile-legend-num-highlight">Number</span> under each stat is the player's league-wide percentile rank (0-100). Higher = better.
          </div>
        </div>
      )}
      {mode !== 'advanced' && (
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
                  <PctileCell value={fmt(p[`ppg${suf}`])} pctile={p[`ppg${suf}_pctile`]} faded={faded} showPctile={showPctile} />
                  <PctileCell value={fmt(p[`rpg${suf}`])} pctile={p[`rpg${suf}_pctile`]} faded={faded} showPctile={showPctile} />
                  <PctileCell value={fmt(p[`apg${suf}`])} pctile={p[`apg${suf}_pctile`]} faded={faded} showPctile={showPctile} />
                  <PctileCell value={fmt(p[`spg${suf}`])} pctile={p[`spg${suf}_pctile`]} faded={faded} showPctile={showPctile} />
                  <PctileCell value={fmt(p[`bpg${suf}`])} pctile={p[`bpg${suf}_pctile`]} faded={faded} showPctile={showPctile} />
                  <PctileCell value={fmt(p[`tov${suf}`])} pctile={p[`tov${suf}_pctile`]} faded={faded} invert showPctile={showPctile} />
                  <PctileCell value={pct(p.fg_pct)}  pctile={p.fg_pct_pctile}  faded={faded} showPctile={showPctile} />
                  <PctileCell value={pct(p.fg3_pct)} pctile={p.fg3_pct_pctile} faded={faded} showPctile={showPctile} />
                  <PctileCell value={pct(p.ft_pct)}  pctile={p.ft_pct_pctile}  faded={faded} showPctile={showPctile} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
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
function PctileCell({ value, pctile, faded, invert = false, showPctile = false }) {
  const colorPctile = invert && pctile != null ? 1 - pctile : pctile
  const bg = colorForPctile(colorPctile)
  const className = ['pctile-cell', faded].filter(Boolean).join(' ')
  // Pctile badge: round to int, prefix with "p" (e.g. p93) so the user
  // can tell the number is a percentile rank, not another stat value.
  // Hidden if the pctile is missing or if showPctile is false (non-Per-Game).
  const showBadge = showPctile && pctile != null
  return (
    <td className={className} style={{ backgroundColor: bg }}>
      <div className="pctile-cell-value">{value}</div>
      {showBadge && (
        <div className="pctile-cell-badge">{Math.round(colorPctile * 100)}</div>
      )}
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

// FTr convention: shown as a 3-decimal ratio (e.g. 0.327) rather than a
// percent. Matches NBA.com / Basketball Reference display of FTA_RATE.
function num3(value) {
  if (value == null) return '—'
  return value.toFixed(3)
}

// Signed percent, for DFG+/- vs Norm. Negative is good (opponent shoots
// worse than normal); positive is bad.
function signedPct(value) {
  if (value == null) return '—'
  const n = value * 100
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(1) + '%'
}
