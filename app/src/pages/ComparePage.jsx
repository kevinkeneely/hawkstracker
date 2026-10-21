import { useParams, Link } from 'react-router-dom'
import Tabs from '../components/Tabs'

// Mirror the hustle/clutch field configs from PlayerProfilePage so the compare
// view uses the same stat set + labels + per-field format/invert flags.
// Flattened to one list each because the compare layout doesn't need groups.
const HUSTLE_ROWS = [
  { key: 'contested_shots',       label: 'Contested Shots',      format: 'num1' },
  { key: 'contested_shots_2pt',   label: 'Contested 2PT',        format: 'num1' },
  { key: 'contested_shots_3pt',   label: 'Contested 3PT',        format: 'num1' },
  { key: 'deflections',           label: 'Deflections',          format: 'num1' },
  { key: 'loose_balls_recovered', label: 'Loose Balls',          format: 'num1' },
  { key: 'charges_drawn',         label: 'Charges Drawn',        format: 'num1' },
  { key: 'screen_assists',        label: 'Screen Assists',       format: 'num1' },
  { key: 'screen_ast_pts',        label: 'Screen Ast. PTS',      format: 'num1' },
  { key: 'box_outs',              label: 'Box Outs',             format: 'num1' },
  { key: 'pct_box_outs_off',      label: 'Off. Box Out %',       format: 'pct'  },
  { key: 'pct_box_outs_def',      label: 'Def. Box Out %',       format: 'pct'  },
]

const CLUTCH_ROWS = [
  { key: 'pts',         label: 'PTS',        format: 'num1' },
  { key: 'reb',         label: 'REB',        format: 'num1' },
  { key: 'ast',         label: 'AST',        format: 'num1' },
  { key: 'stl',         label: 'STL',        format: 'num1' },
  { key: 'blk',         label: 'BLK',        format: 'num1' },
  { key: 'tov',         label: 'TOV',        format: 'num1', invert: true },
  { key: 'fg_pct',      label: 'FG%',        format: 'pct'  },
  { key: 'fg3_pct',     label: '3P%',        format: 'pct'  },
  { key: 'ft_pct',      label: 'FT%',        format: 'pct'  },
  { key: 'ts_pct',      label: 'TS%',        format: 'pct'  },
  { key: 'efg_pct',     label: 'eFG%',       format: 'pct'  },
  { key: 'usg_pct',     label: 'USG%',       format: 'pct'  },
  { key: 'ast_pct',     label: 'AST%',       format: 'pct'  },
  { key: 'tm_tov_pct',  label: 'Team TOV%',  format: 'pct_raw', invert: true },
  { key: 'off_rating',  label: 'Off Rating', format: 'num1' },
  { key: 'def_rating',  label: 'Def Rating', format: 'num1', invert: true },
  { key: 'net_rating',  label: 'Net Rating', format: 'num1' },
  { key: 'plus_minus',  label: '+/−',        format: 'num1' },
  { key: 'pie',         label: 'PIE',        format: 'pct'  },
]

const TRADITIONAL_ROWS = [
  { key: 'gp',          label: 'GP',         format: 'int'  },
  { key: 'mpg',         label: 'MPG',        format: 'num1' },
  { key: 'ppg',         label: 'PPG',        format: 'num1' },
  { key: 'rpg',         label: 'RPG',        format: 'num1' },
  { key: 'apg',         label: 'APG',        format: 'num1' },
  { key: 'spg',         label: 'SPG',        format: 'num1' },
  { key: 'bpg',         label: 'BPG',        format: 'num1' },
  { key: 'tov',         label: 'TOV',        format: 'num1', invert: true },
  { key: 'fg_pct',      label: 'FG%',        format: 'pct'  },
  { key: 'fg3_pct',     label: '3P%',        format: 'pct'  },
  { key: 'ft_pct',      label: 'FT%',        format: 'pct'  },
  { key: 'ts_pct',      label: 'TS%',        format: 'pct'  },
  { key: 'efg_pct',     label: 'eFG%',       format: 'pct'  },
  { key: 'usg_pct',     label: 'USG%',       format: 'pct'  },
  { key: 'ast_pct',     label: 'AST%',       format: 'pct'  },
  { key: 'tov_pct',     label: 'TOV%',       format: 'pct',  invert: true },
  { key: 'off_rating',  label: 'ORtg',       format: 'num1' },
  { key: 'def_rating',  label: 'DRtg',       format: 'num1', invert: true },
  { key: 'net_rating',  label: 'NetRtg',     format: 'num1' },
  { key: 'per',         label: 'PIE',        format: 'pct'  },
]

function formatStatValue(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  if (format === 'pct')     return `${(value * 100).toFixed(1)}%`
  if (format === 'pct_raw') return `${Number(value).toFixed(1)}%`
  if (format === 'int')     return `${Math.round(value)}`
  return Number(value).toFixed(1)
}

export default function ComparePage({ playerData }) {
  const { id1, id2 } = useParams()
  const p1 = playerData?.players.find(p => p.id === Number(id1))
  const p2 = playerData?.players.find(p => p.id === Number(id2))

  if (!p1 || !p2) {
    return (
      <div className="profile-missing">
        <p>One or both players not found for this season.</p>
        <Link to="/players">← Back to all players</Link>
      </div>
    )
  }

  return (
    <div className="compare-page">
      <Link to={`/players/${p1.id}`} className="profile-back">← Back to {p1.name}</Link>

      <header className="compare-header">
        <PlayerCard player={p1} />
        <div className="compare-vs">VS</div>
        <PlayerCard player={p2} />
      </header>

      <Tabs
        tabs={[
          {
            key: 'traditional',
            label: 'Traditional',
            content: <CompareTable rows={TRADITIONAL_ROWS} p1={p1} p2={p2} />,
          },
          {
            key: 'hustle',
            label: 'Hustle',
            content: <CompareNested rows={HUSTLE_ROWS} h1={p1.hustle} h2={p2.hustle} missingLabel="hustle" />,
          },
          {
            key: 'clutch',
            label: 'Clutch',
            content: <CompareNested rows={CLUTCH_ROWS} h1={p1.clutch} h2={p2.clutch} missingLabel="clutch" />,
          },
        ]}
      />
    </div>
  )
}

function PlayerCard({ player }) {
  const url = `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.id}.png`
  return (
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
  )
}

/** Row component: value | label | value, highlighting the winner. */
function CompareRow({ label, v1, v2, format, invert }) {
  const display1 = formatStatValue(v1, format)
  const display2 = formatStatValue(v2, format)

  let winner = null
  if (v1 != null && v2 != null && v1 !== v2) {
    const higherIsBetter = !invert
    const p1Better = higherIsBetter ? v1 > v2 : v1 < v2
    winner = p1Better ? 1 : 2
  }

  return (
    <div className="compare-row">
      <div className={`compare-value compare-value-left ${winner === 1 ? 'is-winner' : ''}`}>
        {display1}
      </div>
      <div className="compare-label">{label}</div>
      <div className={`compare-value compare-value-right ${winner === 2 ? 'is-winner' : ''}`}>
        {display2}
      </div>
    </div>
  )
}

/** Traditional stats live directly on the player object. */
function CompareTable({ rows, p1, p2 }) {
  return (
    <div className="compare-table">
      {rows.map(r => (
        <CompareRow
          key={r.key}
          label={r.label}
          v1={p1?.[r.key]}
          v2={p2?.[r.key]}
          format={r.format}
          invert={r.invert}
        />
      ))}
    </div>
  )
}

/** Hustle / clutch stats live inside a nested dict with {value, pctile} entries. */
function CompareNested({ rows, h1, h2, missingLabel }) {
  if (!h1 && !h2) {
    return (
      <div className="tab-placeholder">
        <p>Neither player has {missingLabel} data this season.</p>
      </div>
    )
  }
  return (
    <div className="compare-table">
      {rows.map(r => (
        <CompareRow
          key={r.key}
          label={r.label}
          v1={h1?.[r.key]?.value}
          v2={h2?.[r.key]?.value}
          format={r.format}
          invert={r.invert}
        />
      ))}
    </div>
  )
}
