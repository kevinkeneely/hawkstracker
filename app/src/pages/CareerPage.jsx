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
const CAREER_STATS = [
  // Context
  { key: 'gp',       label: 'GP',    format: 'int'  },
  { key: 'min',      label: 'MPG',   format: 'num1' },
  // Counting
  { key: 'pts',      label: 'PTS',   format: 'num1', divider: true },
  { key: 'reb',      label: 'REB',   format: 'num1' },
  { key: 'oreb',     label: 'OREB',  format: 'num1' },
  { key: 'dreb',     label: 'DREB',  format: 'num1' },
  { key: 'ast',      label: 'AST',   format: 'num1' },
  { key: 'stl',      label: 'STL',   format: 'num1' },
  { key: 'blk',      label: 'BLK',   format: 'num1' },
  { key: 'tov',      label: 'TOV',   format: 'num1' },
  // Shooting splits
  { key: 'fg_pct',   label: 'FG%',   format: 'pct',  divider: true },
  { key: 'fg3_pct',  label: '3P%',   format: 'pct'  },
  { key: 'ft_pct',   label: 'FT%',   format: 'pct'  },
  { key: 'ts_pct',   label: 'TS%',   format: 'pct'  },
  { key: 'efg_pct',  label: 'eFG%',  format: 'pct'  },
]

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
  // (anywhere from 1 to a 20+-year career).
  const gridCols = `140px repeat(${seasons.length}, minmax(90px, 1fr))`

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
            <div
              className="career-row"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="career-label-cell">{stat.label}</div>
              {seasons.map((s) => (
                <div key={s.season} className="career-value-cell">
                  {fmt(s[stat.key], stat.format)}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
