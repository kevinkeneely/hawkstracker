import { Fragment } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'

/**
 * CareerPage — compares a single player's stats across every season of his
 * career, side-by-side. Entry: "Career Comparison" button on the player
 * profile. URL: /career/:playerId
 *
 * Shipped Nov 26 as V1 — Traditional stats only. Each season reads from
 * `player.career.seasons` (an array produced by `transform_player_career.py`).
 * Historical league pools for percentile bars don't exist, and Advanced /
 * Hustle per past season aren't fetched, so this view is raw per-game
 * values only. That's fine — the point of the view is trajectory.
 */

// Stats to render, in display order. Groups separated by a divider row.
// pctile: true means the cell gets colored by that season's league-wide
// percentile rank (stored as `<key>_pctile` on each season entry, 0-1 decimal)
// and shows a small percentile number badge. GP and MPG are context stats —
// they're useful for reading the trajectory but don't get a league rank.
const CAREER_STATS = [
  // Context — no pctile color (GP/MPG are role metrics, not performance)
  { key: 'gp',       label: 'GP',    format: 'int'  },
  { key: 'min',      label: 'MPG',   format: 'num1', thinDivider: true },
  // Counting
  { key: 'pts',      label: 'PTS',   format: 'num1', divider: true, pctile: true },
  { key: 'reb',      label: 'REB',   format: 'num1',                pctile: true },
  { key: 'ast',      label: 'AST',   format: 'num1',                pctile: true },
  { key: 'stl',      label: 'STL',   format: 'num1',                pctile: true },
  { key: 'blk',      label: 'BLK',   format: 'num1',                pctile: true },
  { key: 'tov',      label: 'TOV',   format: 'num1',                pctile: true },
  // Shooting splits
  { key: 'fg_pct',   label: 'FG%',   format: 'pct',  divider: true, pctile: true },
  { key: 'fg3_pct',  label: '3P%',   format: 'pct',                 pctile: true },
  { key: 'ft_pct',   label: 'FT%',   format: 'pct',                 pctile: true },
  { key: 'ts_pct',   label: 'TS%',   format: 'pct',                 pctile: true },
  { key: 'efg_pct',  label: 'eFG%',  format: 'pct',                 pctile: true },
]

// Mirror of colorForPctile() in PlayerStatsTable.jsx — keep in sync. The pctile
// value is already upstream-inverted for stats where lower = better (TOV), so we
// don't invert here. Returns a CSS rgb() string, or 'transparent' for missing.
// Blue = 0th percentile, mid-grey = 50th, Hawks red = 100th.
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

function fmt(value, format) {
  if (value == null || Number.isNaN(value)) return '—'
  if (format === 'pct') return `${(value * 100).toFixed(1)}%`
  if (format === 'int') return `${Math.round(value)}`
  return Number(value).toFixed(1)
}

export default function CareerPage({ playerData }) {
  const { playerId } = useParams()
  const player = playerData?.players?.find(
    (p) => String(p.id) === String(playerId)
  )

  // Unknown player id → bounce to the players list
  if (!player) return <Navigate to="/players" replace />

  const seasons = player.career?.seasons || []

  if (seasons.length === 0) {
    return (
      <div className="career-page">
        <div className="career-header">
          <Link to={`/players/${player.id}`} className="career-back">
            ← Back to {player.name}'s profile
          </Link>
          <h1>{player.name} — Career</h1>
          <p className="career-empty">
            No career-season data available for this player yet. (The daily
            pipeline populates it; if it's missing after tomorrow's refresh,
            something's off.)
          </p>
        </div>
      </div>
    )
  }

  // Grid: a fixed-width label column + one column per season.
  // Set inline so the grid responds to how many seasons the player has
  // (anywhere from 1 to a 20+-year career). Nov 26: tightened label column
  // and per-season min-width to match Player Stats table density; long
  // careers (10+ seasons) still overflow and horizontally scroll.
  const gridCols = `100px repeat(${seasons.length}, minmax(72px, 1fr))`

  return (
    <div className="career-page">
      <div className="career-header">
        <Link to={`/players/${player.id}`} className="career-back">
          ← Back to {player.name}'s profile
        </Link>
        <h1>{player.name} — Career</h1>
        <p className="career-subtitle">
          {seasons.length} {seasons.length === 1 ? 'season' : 'seasons'} ·
          per-game averages ·
          regular season
        </p>
      </div>

      <div className="career-table">
        {/* Season header row */}
        <div
          className="career-row career-row-header"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="career-label-cell" />
          {seasons.map((s) => (
            <div key={s.season} className="career-season-cell">
              <div className="career-season-year">{s.season}</div>
              <div className="career-season-team">{s.team}</div>
              {s.age != null && (
                <div className="career-season-age">Age {s.age}</div>
              )}
            </div>
          ))}
        </div>

        {/* Stat rows */}
        {CAREER_STATS.map((stat) => (
          <Fragment key={stat.key}>
            {stat.divider && (
              <div
                className="career-divider"
                style={{ gridColumn: `1 / span ${seasons.length + 1}` }}
              />
            )}
            {stat.thinDivider && (
              <div
                className="career-divider-thin"
                style={{ gridColumn: `1 / span ${seasons.length + 1}` }}
              />
            )}
            <div
              className="career-row"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="career-label-cell">{stat.label}</div>
              {seasons.map((s) => {
                const pctile = stat.pctile ? s[`${stat.key}_pctile`] : null
                const bg = stat.pctile ? colorForPctile(pctile) : undefined
                return (
                  <div
                    key={s.season}
                    className="career-value-cell"
                    style={bg ? { backgroundColor: bg } : undefined}
                  >
                    <div className="career-value-num">{fmt(s[stat.key], stat.format)}</div>
                    {stat.pctile && pctile != null && (
                      <div className="career-value-pctile">{Math.round(pctile * 100)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
