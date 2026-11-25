import { useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Tabs from '../components/Tabs'
import { downloadNodeAsPng } from '../utils/downloadImage'

// Multi-player compare page (Phase 1, Nov 24). Supports 2-5 players at once.
// Layout is "label on the left + one bar column per player" — mirrors the
// 3+ player layout on Baseball Savant's player comparison tool. A later
// Phase 2 may add the fancy mirrored head-to-head layout for n === 2.
//
// URL format: /compare/<id1,id2[,id3[,id4[,id5]]]>. Comma-separated so a
// dynamic route param works (vs. awkward nested optional path segments).

const MIN_PLAYERS = 2
const MAX_PLAYERS = 5

// ───────── Row config pattern (shared with Phase 1 interim build) ─────────
// Each row carries `extract` + `pctile` closures so one row shape serves
// every tab regardless of how the stat is nested on the player object.
const flat = (key, label, format, invert) => ({
  key, label, format, invert,
  extract: p => p?.[key],
  pctile:  p => p?.[`${key}_pctile`],
})
const nested = (block, key, label, format, invert) => ({
  key: `${block}_${key}`, label, format, invert,
  extract: p => p?.[block]?.[key]?.value,
  pctile:  p => p?.[block]?.[key]?.pctile,
})

// ───────── Traditional ─────────
const TRADITIONAL_ROWS = [
  flat('gp',          'GP',     'int'),
  flat('mpg',         'MPG',    'num1'),
  flat('ppg',         'PPG',    'num1'),
  flat('rpg',         'RPG',    'num1'),
  flat('apg',         'APG',    'num1'),
  flat('spg',         'SPG',    'num1'),
  flat('bpg',         'BPG',    'num1'),
  flat('tov',         'TOV',    'num1', true),
  flat('fg_pct',      'FG%',    'pct'),
  flat('fg3_pct',     '3P%',    'pct'),
  flat('ft_pct',      'FT%',    'pct'),
  flat('ts_pct',      'TS%',    'pct'),
  flat('efg_pct',     'eFG%',   'pct'),
  flat('usg_pct',     'USG%',   'pct'),
  flat('ast_pct',     'AST%',   'pct'),
  flat('tov_pct',     'TOV%',   'pct',  true),
  flat('off_rating',  'ORtg',   'num1'),
  flat('def_rating',  'DRtg',   'num1', true),
  flat('net_rating',  'NetRtg', 'num1'),
]

// ───────── Advanced ─────────
// Mirrors the 4-group layout on each player profile's AdvancedTab so this
// compare view reads as a side-by-side version of what users already know.
const ADVANCED_GROUPS = [
  [
    flat('reb_pct',  'REB%', 'pct'),
    flat('ast_pct',  'AST%', 'pct'),
    flat('stl_pct',  'STL%', 'pct'),
    flat('blk_pct',  'BLK%', 'pct'),
    flat('tov_pct',  'TOV%', 'pct', true),
    flat('efg_pct',  'eFG%', 'pct'),
    flat('ts_pct',   'TS%',  'pct'),
    flat('fta_rate', 'FTr',  'num3'),
  ],
  [
    { key: 'cs_fg3_pct', label: 'C&S 3P%', format: 'pct',
      extract: p => p?.shooting_tracking?.cs?.fg3_pct?.value,
      pctile:  p => p?.shooting_tracking?.cs?.fg3_pct?.pctile },
    { key: 'pu_fg3_pct', label: 'Pull-Up 3P%', format: 'pct',
      extract: p => p?.shooting_tracking?.pullup?.fg3_pct?.value,
      pctile:  p => p?.shooting_tracking?.pullup?.fg3_pct?.pctile },
  ],
  [
    { key: 'd_fg_pct', label: 'DFG% Allowed', format: 'pct', invert: true,
      extract: p => p?.defense_tracking?.d_fg_pct?.value,
      pctile:  p => p?.defense_tracking?.d_fg_pct?.pctile },
    { key: 'd_plusminus', label: 'DFG+/- vs Norm', format: 'pct_signed', invert: true,
      extract: p => p?.defense_tracking?.pct_plusminus?.value,
      pctile:  p => p?.defense_tracking?.pct_plusminus?.pctile },
  ],
  [
    flat('per',  'PER',  'num1'),
    flat('ffos', 'FFOS', 'num1'),
    flat('pis',  'PIS',  'num1'),
  ],
]

// ───────── Hustle ─────────
const HUSTLE_ROWS = [
  nested('hustle', 'contested_shots',       'Contested Shots',  'num1'),
  nested('hustle', 'contested_shots_2pt',   'Contested 2PT',    'num1'),
  nested('hustle', 'contested_shots_3pt',   'Contested 3PT',    'num1'),
  nested('hustle', 'deflections',           'Deflections',      'num1'),
  nested('hustle', 'loose_balls_recovered', 'Loose Balls',      'num1'),
  nested('hustle', 'charges_drawn',         'Charges Drawn',    'num1'),
  nested('hustle', 'screen_assists',        'Screen Assists',   'num1'),
  nested('hustle', 'screen_ast_pts',        'Screen Ast. PTS',  'num1'),
  nested('hustle', 'box_outs',              'Box Outs',         'num1'),
  nested('hustle', 'pct_box_outs_off',      'Off. Box Out %',   'pct'),
  nested('hustle', 'pct_box_outs_def',      'Def. Box Out %',   'pct'),
]

// ───────── Clutch ─────────
const CLUTCH_ROWS = [
  nested('clutch', 'pts',         'PTS',        'num1'),
  nested('clutch', 'reb',         'REB',        'num1'),
  nested('clutch', 'ast',         'AST',        'num1'),
  nested('clutch', 'stl',         'STL',        'num1'),
  nested('clutch', 'blk',         'BLK',        'num1'),
  nested('clutch', 'tov',         'TOV',        'num1', true),
  nested('clutch', 'fg_pct',      'FG%',        'pct'),
  nested('clutch', 'fg3_pct',     '3P%',        'pct'),
  nested('clutch', 'ft_pct',      'FT%',        'pct'),
  nested('clutch', 'ts_pct',      'TS%',        'pct'),
  nested('clutch', 'efg_pct',     'eFG%',       'pct'),
  nested('clutch', 'usg_pct',     'USG%',       'pct'),
  nested('clutch', 'ast_pct',     'AST%',       'pct'),
  nested('clutch', 'tm_tov_pct',  'Team TOV%',  'pct_raw', true),
  nested('clutch', 'off_rating',  'Off Rating', 'num1'),
  nested('clutch', 'def_rating',  'Def Rating', 'num1',    true),
  nested('clutch', 'net_rating',  'Net Rating', 'num1'),
  nested('clutch', 'plus_minus',  '+/−',        'num1'),
]

function formatStatValue(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  if (format === 'pct')        return `${(value * 100).toFixed(1)}%`
  if (format === 'pct_raw')    return `${Number(value).toFixed(1)}%`
  if (format === 'pct_signed') {
    const n = value * 100
    return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
  }
  if (format === 'num3')       return Number(value).toFixed(3)
  if (format === 'int')        return `${Math.round(value)}`
  return Number(value).toFixed(1)
}

// Red / neutral / blue ramp copied from PlayerProfilePage so compare bars
// visually match profile bars exactly.
function colorForPctile(pctile) {
  if (pctile == null) return 'transparent'
  const BLUE = [63, 81, 181]
  const MID  = [138, 130, 144]
  const RED  = [200, 16, 46]
  const [r1, g1, b1] = pctile <= 0.5 ? BLUE : MID
  const [r2, g2, b2] = pctile <= 0.5 ? MID  : RED
  const t = pctile <= 0.5 ? pctile * 2 : (pctile - 0.5) * 2
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${b})`
}

// ───────── Bar + Row renderers ─────────

function CompareBar({ pctile, value, invert, format }) {
  const colorPctile = invert && pctile != null ? 1 - pctile : pctile
  const bg = colorForPctile(colorPctile)
  const widthPct = pctile == null ? 0 : (colorPctile ?? 0) * 100
  const dotLabel = pctile == null ? '—' : Math.round((invert ? 1 - pctile : pctile) * 100)
  return (
    <div className="compare-bar">
      <div className="compare-bar-track">
        <div
          className="compare-bar-fill"
          style={{ width: `${widthPct}%`, backgroundColor: bg }}
        />
        {pctile != null && (
          <div
            className="compare-bar-dot"
            style={{ left: `${widthPct}%`, backgroundColor: bg }}
          >
            {dotLabel}
          </div>
        )}
      </div>
      <div className="compare-bar-value">{formatStatValue(value, format)}</div>
    </div>
  )
}

/** One stat row: [label (left-aligned)] + [one bar per player]. The grid
 * column template is set inline so it adapts to how many players we're
 * comparing — "180px repeat(N, 1fr)" scales cleanly for 2 through 5. */
function CompareBarRow({ row, players }) {
  const tpl = { gridTemplateColumns: `180px repeat(${players.length}, 1fr)` }
  return (
    <div className="compare-bar-row" style={tpl}>
      <div className="compare-bar-row-label">{row.label}</div>
      {players.map(p => (
        <CompareBar
          key={p.id}
          pctile={row.pctile(p)}
          value={row.extract(p)}
          invert={row.invert}
          format={row.format}
        />
      ))}
    </div>
  )
}

function CompareBars({ rows, players }) {
  return (
    <div className="compare-bars">
      {rows.map(r => (
        <CompareBarRow key={r.key} row={r} players={players} />
      ))}
    </div>
  )
}

function CompareBarsGrouped({ groups, players }) {
  return (
    <div className="compare-bars">
      {groups.map((group, gIdx) => (
        <div key={gIdx}>
          {gIdx > 0 && <div className="compare-bar-divider" />}
          {group.map(r => (
            <CompareBarRow key={r.key} row={r} players={players} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Show a placeholder iff NO player on the page has the nested block — if
 * even one player has it, we render all rows (missing players just render
 * empty bars + "—"). That matches how the profile Hustle/Clutch tabs
 * degrade when the player has no data. */
function CompareBarsMaybeMissing({ rows, players, block, missingLabel }) {
  if (players.every(p => !p?.[block])) {
    return (
      <div className="tab-placeholder">
        <p>None of these players have {missingLabel} data this season.</p>
      </div>
    )
  }
  return <CompareBars rows={rows} players={players} />
}

// ───────── Player card (header strip) ─────────

/** One player header card — headshot + name + pos/age + optional remove X.
 * Remove button hidden when we're already at MIN_PLAYERS so the compare
 * never collapses below 2 players. */
function PlayerCard({ player, canRemove, onRemove }) {
  const url = `/nba-headshots/${player.id}.png`
  return (
    <div className="compare-player-card-wrap">
      {canRemove && (
        <button
          type="button"
          className="compare-remove-btn"
          onClick={onRemove}
          aria-label={`Remove ${player.name} from comparison`}
        >
          ×
        </button>
      )}
      <Link to={`/players/${player.id}`} className="compare-player-card">
        <img
          src={url}
          alt={player.name}
          className="profile-headshot"
          onError={(e) => (e.target.style.visibility = 'hidden')}
        />
        <h2>{player.name}</h2>
        <p>{player.pos ?? '—'} · Age {player.age}</p>
      </Link>
    </div>
  )
}

/** "+" button → opens an inline select to add another player (up to
 * MAX_PLAYERS). Filters out players already in the comparison. Hidden when
 * at MAX_PLAYERS. */
function AddPlayerSlot({ playerData, currentIds, onAdd }) {
  const [picking, setPicking] = useState(false)
  const available = (playerData?.players ?? []).filter(p => !currentIds.includes(p.id))
  if (available.length === 0) return null

  if (!picking) {
    return (
      <button
        type="button"
        className="compare-add-btn"
        onClick={() => setPicking(true)}
        aria-label="Add another player to the comparison"
      >
        +
      </button>
    )
  }
  return (
    <div className="compare-add-picker">
      <select
        autoFocus
        onChange={(e) => {
          const id = Number(e.target.value)
          if (id) onAdd(id)
          setPicking(false)
        }}
        onBlur={() => setPicking(false)}
        aria-label="Pick a player to add"
        defaultValue=""
      >
        <option value="" disabled>Add player…</option>
        {available.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}

export default function ComparePage({ playerData }) {
  const { ids } = useParams()
  const navigate = useNavigate()

  // Parse the comma-separated :ids segment into an array of ints, then
  // look each one up in playerData. Invalid or missing ids drop out.
  const idList = (ids || '').split(',').map(s => Number(s)).filter(n => Number.isFinite(n) && n > 0)
  const players = idList
    .map(id => playerData?.players.find(p => p.id === id))
    .filter(Boolean)

  const pageRef = useRef(null)
  const handleDownload = () => {
    if (players.length < MIN_PLAYERS) return
    const name = players.map(p => p.name).join('-vs-')
    downloadNodeAsPng(pageRef.current, name, { ignoreSelector: '.save-png-btn,.compare-remove-btn,.compare-add-btn,.compare-add-picker' })
  }

  // URL mutators — adding/removing a player replaces the ids segment and
  // navigates. React Router re-renders this component with the new params.
  const replaceIds = (newIds) => navigate(`/compare/${newIds.join(',')}`)
  const removePlayer = (id) => {
    if (players.length <= MIN_PLAYERS) return
    replaceIds(players.filter(p => p.id !== id).map(p => p.id))
  }
  const addPlayer = (id) => {
    if (players.length >= MAX_PLAYERS) return
    replaceIds([...players.map(p => p.id), id])
  }

  if (players.length < MIN_PLAYERS) {
    return (
      <div className="profile-missing">
        <p>Need at least {MIN_PLAYERS} valid players to compare.</p>
        <Link to="/players">← Back to all players</Link>
      </div>
    )
  }

  const canRemove = players.length > MIN_PLAYERS

  return (
    <div className="compare-page" ref={pageRef}>
      <div className="compare-top-bar">
        <Link to={`/players/${players[0].id}`} className="profile-back">← Back to {players[0].name}</Link>
        <button type="button" className="save-png-btn" onClick={handleDownload}>Save PNG</button>
      </div>

      <header className="compare-header compare-header-multi">
        {players.map(p => (
          <PlayerCard
            key={p.id}
            player={p}
            canRemove={canRemove}
            onRemove={() => removePlayer(p.id)}
          />
        ))}
        {players.length < MAX_PLAYERS && (
          <AddPlayerSlot
            playerData={playerData}
            currentIds={players.map(p => p.id)}
            onAdd={addPlayer}
          />
        )}
      </header>

      <Tabs
        tabs={[
          {
            key: 'traditional',
            label: 'Traditional',
            content: <CompareBars rows={TRADITIONAL_ROWS} players={players} />,
          },
          {
            key: 'advanced',
            label: 'Advanced',
            content: <CompareBarsGrouped groups={ADVANCED_GROUPS} players={players} />,
          },
          {
            key: 'hustle',
            label: 'Hustle',
            content: <CompareBarsMaybeMissing rows={HUSTLE_ROWS} players={players}
                        block="hustle" missingLabel="hustle" />,
          },
          {
            key: 'clutch',
            label: 'Clutch',
            content: <CompareBarsMaybeMissing rows={CLUTCH_ROWS} players={players}
                        block="clutch" missingLabel="clutch" />,
          },
        ]}
      />
    </div>
  )
}
