import { useParams, Link, useNavigate } from 'react-router-dom'
import ShotChart from '../components/ShotChart'
import Tabs from '../components/Tabs'

export default function PlayerProfilePage({ playerData, leagueBaseline }) {
  const { id } = useParams()
  const playerId = Number(id)
  const player = playerData?.players.find((p) => p.id === playerId)

  if (!player) {
    return (
      <div className="profile-missing">
        <p>Player not found.</p>
        <Link to="/players">← Back to all players</Link>
      </div>
    )
  }

  const headshotUrl = `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.id}.png`

  return (
    <div className="player-profile">
      <Link to="/players" className="profile-back">← All players</Link>

      <header className="profile-header">
        <img
          src={headshotUrl}
          alt={player.name}
          className="profile-headshot"
          onError={(e) => (e.target.style.visibility = 'hidden')}
        />
        <div className="profile-identity">
          <h1>{player.name}</h1>
          <p className="profile-meta">
            {player.pos ?? '—'} · Age {player.age} · Atlanta Hawks
          </p>
          <CompareSelector currentPlayerId={player.id} playerData={playerData} />
        </div>
      </header>

      <Tabs
        tabs={[
          {
            key: 'traditional',
            label: 'Traditional',
            content: <TraditionalTab player={player} leagueBaseline={leagueBaseline} />,
          },
          {
            key: 'hustle',
            label: 'Hustle',
            content: <HustleTab player={player} />,
          },
          {
            key: 'clutch',
            label: 'Clutch',
            content: <ClutchTab player={player} />,
          },
          {
            key: 'shot-charts',
            label: 'Shot Charts',
            content: <ShotChartTab player={player} leagueBaseline={leagueBaseline} />,
          },
        ]}
      />
    </div>
  )
}

function TraditionalTab({ player, leagueBaseline }) {
  return (
    <>
      <section className="profile-stats">
        <h2>2025–26 Season</h2>
        <StatLine player={player} />
      </section>

      {player.zones && (
        <section className="profile-zones">
          <h2>Shot Zones</h2>
          <ZoneChips zones={player.zones} />
        </section>
      )}

      <section className="profile-percentiles">
        <h2>vs. League</h2>
        <PercentileBars player={player} />
      </section>
    </>
  )
}

// ─────────────── Hustle + Clutch config ───────────────

const HUSTLE_GROUPS = [
  [
    { key: 'contested_shots', label: 'Contested Shots', format: 'num1' },
    { key: 'box_outs', label: 'Box Outs', format: 'num1' },
    { key: 'contested_shots_2pt', label: 'Contested 2PT', format: 'num1' },
    { key: 'pct_box_outs_off', label: 'Off. Box Outs', format: 'pct' },
    { key: 'contested_shots_3pt', label: 'Contested 3PT', format: 'num1' },
    { key: 'pct_box_outs_def', label: 'Def. Box Outs', format: 'pct' },
    { key: 'screen_assists', label: 'Screen Assists', format: 'num1' },
    { key: 'charges_drawn', label: 'Charges Drawn', format: 'num1' },
    { key: 'screen_ast_pts', label: 'Screen Assist PTS', format: 'num1' },
    { key: 'deflections', label: 'Deflections', format: 'num1' },
    { key: 'loose_balls_recovered', label: 'Loose Balls Recovered', format: 'num1' },
  ],
]

const CLUTCH_GROUPS = [
  [
    { key: 'pts', label: 'PTS', format: 'num1' },
    { key: 'net_rating', label: 'Net Rating', format: 'num1' },
    { key: 'reb', label: 'REB', format: 'num1' },
    { key: 'off_rating', label: 'Off Rating', format: 'num1' },
    { key: 'ast', label: 'AST', format: 'num1' },
    { key: 'def_rating', label: 'Def Rating', format: 'num1', invert: true },
    { key: 'stl', label: 'STL', format: 'num1' },
    { key: 'plus_minus', label: '+/−', format: 'num1' },
    { key: 'blk', label: 'BLK', format: 'num1' },
    { key: 'oreb', label: 'OREB', format: 'num1' },
    { key: 'tov', label: 'TOV', format: 'num1', invert: true },
    { key: 'dreb', label: 'DREB', format: 'num1' },
    { key: 'fg_pct', label: 'FG%', format: 'pct' },
    { key: 'pf', label: 'PF', format: 'num1', invert: true },
    { key: 'fg3_pct', label: '3P%', format: 'pct' },
    { key: 'efg_pct', label: 'eFG%', format: 'pct' },
    { key: 'ft_pct', label: 'FT%', format: 'pct' },
    { key: 'ts_pct', label: 'TS%', format: 'pct' },
  ],
  [
    { key: 'ast_pct', label: 'AST%', format: 'pct' },
    { key: 'oreb_pct', label: 'OREB%', format: 'pct' },
    { key: 'dreb_pct', label: 'DREB%', format: 'pct' },
    { key: 'reb_pct', label: 'REB%', format: 'pct' },
    { key: 'tm_tov_pct', label: 'Team TOV%', format: 'pct_raw', invert: true },
    { key: 'usg_pct', label: 'USG%', format: 'pct' },
    { key: 'pie', label: 'PIE', format: 'pct' },
  ],
]

function formatStatValue(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  if (format === 'pct') return `${(value * 100).toFixed(1)}%`
  if (format === 'pct_raw') return `${Number(value).toFixed(1)}%`
  if (format === 'int') return `${Math.round(value)}`
  return Number(value).toFixed(1)
}

function GroupedPctileBars({ groups, data }) {
  return (
    <div className="pctile-grouped">
      {groups.map((group, gIdx) => (
        <div key={gIdx}>
          {gIdx > 0 && <div className="pctile-divider" />}
          <div className="pctile-group">
            {group.map(({ key, label, format, invert }) => {
              const entry = data?.[key]
              return (
                <PctileBar
                  key={key}
                  label={label}
                  value={formatStatValue(entry?.value, format)}
                  pctile={entry?.pctile}
                  invert={invert}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function HustleTab({ player }) {
  if (!player.hustle) {
    return (
      <div className="tab-placeholder">
        <p>No hustle data available yet.</p>
      </div>
    )
  }
  return (
    <section className="profile-percentiles">
      <GroupedPctileBars groups={HUSTLE_GROUPS} data={player.hustle} />
    </section>
  )
}

function ClutchTab({ player }) {
  if (!player.clutch) {
    return (
      <div className="tab-placeholder">
        <p>No clutch minutes played yet this season.</p>
      </div>
    )
  }
  const gp = player.clutch.gp?.value
  const mpg = player.clutch.min?.value
  return (
    <section className="profile-percentiles">
      <div className="clutch-summary">
        GP: {gp ?? '—'} · MPG: {mpg != null ? mpg.toFixed(1) : '—'}
      </div>
      <GroupedPctileBars groups={CLUTCH_GROUPS} data={player.clutch} />
    </section>
  )
}

function ShotChartTab({ player, leagueBaseline }) {
  return (
    <section className="profile-shots">
      <h2>Shot Chart</h2>
      <ShotChart playerId={player.id} leagueBaseline={leagueBaseline} zones={player.zones} />
    </section>
  )
}

function ComingSoon({ label }) {
  return (
    <div className="tab-placeholder">
      <p>{label} coming soon.</p>
    </div>
  )
}

function StatLine({ player }) {
  const rows = [
    ['GP', player.gp],
    ['MPG', fmt(player.mpg)],
    ['PPG', fmt(player.ppg)],
    ['RPG', fmt(player.rpg)],
    ['APG', fmt(player.apg)],
    ['SPG', fmt(player.spg)],
    ['BPG', fmt(player.bpg)],
    ['TOV', fmt(player.tov)],
    ['FG%', pct(player.fg_pct)],
    ['3P%', pct(player.fg3_pct)],
    ['FT%', pct(player.ft_pct)],
  ]
  return (
    <div className="stat-line">
      {rows.map(([label, value]) => (
        <div className="stat-chip" key={label}>
          <div className="stat-chip-label">{label}</div>
          <div className="stat-chip-value">{value}</div>
        </div>
      ))}
    </div>
  )
}

function ZoneChips({ zones }) {
  const rows = [
    ['At Rim',       zones.at_rim],
    ['Paint',        zones.paint],
    ['Mid-Range',    zones.mid],
    ['Corner 3',     zones.corner_3],
    ['Above Break',  zones.above_break_3],
  ]
  return (
    <div className="stat-line">
      {rows.map(([label, z]) => {
        const displayPct = z.pct == null ? '—' : (z.pct * 100).toFixed(1) + '%'
        const tooltip =
          z.pct == null
            ? `${label}: no attempts`
            : `${z.fgm}/${z.fga} · ${(z.pct * 100).toFixed(1)}%`
        return (
          <div className="stat-chip" key={label} title={tooltip}>
            <div className="stat-chip-label">{label}</div>
            <div className="stat-chip-value">{displayPct}</div>
          </div>
        )
      })}
    </div>
  )
}

function PercentileBars({ player }) {
  // [label, pctile, invert, rawValue]
  const rows = [
    ['PPG',  player.ppg_pctile,     false, fmt(player.ppg)],
    ['RPG',  player.rpg_pctile,     false, fmt(player.rpg)],
    ['APG',  player.apg_pctile,     false, fmt(player.apg)],
    ['SPG',  player.spg_pctile,     false, fmt(player.spg)],
    ['BPG',  player.bpg_pctile,     false, fmt(player.bpg)],
    ['TOV',  player.tov_pctile,     true,  fmt(player.tov)],
    ['FG%',  player.fg_pct_pctile,  false, pct(player.fg_pct)],
    ['3P%',  player.fg3_pct_pctile, false, pct(player.fg3_pct)],
    ['FT%',  player.ft_pct_pctile,  false, pct(player.ft_pct)],
  ]
  return (
    <div className="pctile-bars">
      {rows.map(([label, pctile, invert, value]) => (
        <PctileBar key={label} label={label} pctile={pctile} invert={invert} value={value} />
      ))}
    </div>
  )
}

function PctileBar({ label, pctile, invert, value }) {
  const colorPctile = invert && pctile != null ? 1 - pctile : pctile
  const bg = colorForPctile(colorPctile)
  const widthPct = pctile == null ? 0 : (colorPctile ?? 0) * 100
  const dotLabel = pctile == null ? '—' : Math.round((invert ? 1 - pctile : pctile) * 100)

  return (
    <div className="pctile-bar-row">
      <div className="pctile-bar-label">{label}</div>
      <div className="pctile-bar-track">
        <div
          className="pctile-bar-fill"
          style={{ width: `${widthPct}%`, backgroundColor: bg }}
        />
        {pctile != null && (
          <div
            className="pctile-bar-dot"
            style={{ left: `${widthPct}%`, backgroundColor: bg }}
          >
            {dotLabel}
          </div>
        )}
      </div>
      <div className="pctile-bar-value">{value}</div>
    </div>
  )
}

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

function fmt(value) {
  if (value == null) return '—'
  return value.toFixed(1)
}

function pct(value) {
  if (value == null) return '—'
  return (value * 100).toFixed(1) + '%'
}


function CompareSelector({ currentPlayerId, playerData }) {
  const navigate = useNavigate()
  const others = (playerData?.players || [])
    .filter((p) => p.id !== currentPlayerId)
    .slice()
    .sort((a, b) => (b.mpg ?? 0) - (a.mpg ?? 0))
  if (others.length === 0) return null
  return (
    <select
      className="compare-select"
      value=""
      onChange={(e) => {
        const otherId = e.target.value
        if (otherId) navigate(`/compare/${currentPlayerId}/${otherId}`)
      }}
      aria-label="Compare with another Hawks player"
    >
      <option value="">Compare with…</option>
      {others.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}
