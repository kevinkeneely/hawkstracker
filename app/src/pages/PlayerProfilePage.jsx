import { useParams, Link } from 'react-router-dom'

export default function PlayerProfilePage({ playerData }) {
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
        </div>
      </header>

      <section className="profile-stats">
        <h2>2025–26 Season</h2>
        <StatLine player={player} />
      </section>

      <section className="profile-percentiles">
        <h2>vs. League</h2>
        <PercentileBars player={player} />
      </section>

      <section className="profile-shots">
        <h2>Shot Chart</h2>
        <p className="profile-stub">Shot chart coming in the next commit.</p>
      </section>
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