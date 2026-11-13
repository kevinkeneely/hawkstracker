import { useMemo, useState } from 'react'
import TrendSparkline, { formatValue } from '../components/TrendSparkline'

/**
 * Trends tab — per-player + team-level rolling-window form view.
 *
 * Data: /game_logs-<season>.json (loaded in App.jsx, passed as `gameLogs`).
 * If missing, show a friendly empty state.
 *
 * Layout:
 *   - Top: rolling-window slider (5-20 games, default 10)
 *   - Team section: 3 sparklines (Net Rating, Pace, TS%)
 *   - Player grid: one row per player with 7 sparklines each
 *     (PPG, FG%, 3P%, FT%, eFG%, TS%, Net Rating)
 */

// Each stat gets a label, its path on the per-game entry, a format hint,
// and a color for the sparkline line.
const PLAYER_STATS = [
  { key: 'pts',        label: 'PPG',    format: 'num',    color: '#e03a3e' },
  { key: 'fg_pct',     label: 'FG%',    format: 'pct',    color: '#2980b9' },
  { key: 'fg3_pct',    label: '3P%',    format: 'pct',    color: '#16a085' },
  { key: 'ft_pct',     label: 'FT%',    format: 'pct',    color: '#d35400' },
  { key: 'efg_pct',    label: 'eFG%',   format: 'pct',    color: '#8e44ad' },
  { key: 'ts_pct',     label: 'TS%',    format: 'pct',    color: '#c2185b' },
  { key: 'net_rating', label: 'Net',    format: 'rating', color: '#27ae60' },
]

const TEAM_STATS = [
  { key: 'net_rating', label: 'Net Rating', format: 'rating', color: '#e03a3e' },
  { key: 'pace',       label: 'Pace',       format: 'num',    color: '#2980b9' },
  { key: 'ts_pct',     label: 'TS%',        format: 'pct',    color: '#16a085' },
  { key: 'efg_pct',    label: 'eFG%',       format: 'pct',    color: '#8e44ad' },
  // Lower TOV% is better, so inversePositive flips the green/red on the delta
  { key: 'tov_pct',    label: 'TOV%',       format: 'pct',    color: '#d35400', inversePositive: true },
  { key: 'oreb_pct',   label: 'OReb%',      format: 'pct',    color: '#c2185b' },
]

const WINDOW_OPTIONS = [5, 10, 15, 20]
const DEFAULT_WINDOW = 10

export default function TrendsPage({ gameLogs }) {
  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW)

  if (!gameLogs) {
    return (
      <div className="trends-empty">
        <p>Trend data isn't available yet. It'll appear after the next pipeline refresh.</p>
      </div>
    )
  }

  // Filter players who have at least played some games
  const players = useMemo(
    () => gameLogs.players.filter((p) => p.games && p.games.length >= 3),
    [gameLogs]
  )
  const teamGames = gameLogs.team?.games || []
  // Hide options that would exceed the available game count. Always show at
  // least one option (the smallest) so the UI isn't empty early in the season.
  const availableOptions = WINDOW_OPTIONS.filter(
    (n) => teamGames.length === 0 || n <= teamGames.length || n === WINDOW_OPTIONS[0]
  )
  const effectiveWindow = availableOptions.includes(windowSize)
    ? windowSize
    : availableOptions[availableOptions.length - 1] || WINDOW_OPTIONS[0]

  return (
    <div className="trends-page">
      <div className="trends-header">
        <h2>Rolling form</h2>
        <p className="trends-sub">
          How the Hawks and each player are trending. Line shows every game played; dashed line is the season average; last-{effectiveWindow} window highlighted.
        </p>
        <div className="trends-window-group" role="group" aria-label="Rolling window size">
          <span className="trends-window-label">Rolling window:</span>
          {availableOptions.map((n) => (
            <button
              key={n}
              type="button"
              className={`trends-window-btn ${n === effectiveWindow ? 'active' : ''}`}
              onClick={() => setWindowSize(n)}
            >
              Last {n}
            </button>
          ))}
        </div>
      </div>

      {/* Team section */}
      {teamGames.length > 0 && (
        <section className="trends-team">
          <h3>Team</h3>
          <div className="trends-team-grid">
            {TEAM_STATS.map((stat) => (
              <TeamTrendCard
                key={stat.key}
                stat={stat}
                games={teamGames}
                windowSize={effectiveWindow}
              />
            ))}
          </div>
        </section>
      )}

      {/* Player section */}
      <section className="trends-players">
        <h3>Players</h3>
        {/* Wrapper so head + rows scroll together horizontally on mobile.
            On desktop the fr-based grid fits without scrolling. */}
        <div className="trends-players-scroll">
          <div className="trends-players-head">
            <div className="trends-player-name-head">Player</div>
            {PLAYER_STATS.map((s) => (
              <div key={s.key} className="trends-stat-head">{s.label}</div>
            ))}
          </div>
          {players.map((p) => (
            <PlayerTrendRow key={p.id} player={p} windowSize={effectiveWindow} />
          ))}
        </div>
      </section>
    </div>
  )
}

function TeamTrendCard({ stat, games, windowSize }) {
  const seriesData = useMemo(
    () =>
      games.map((g) => ({
        value: g[stat.key],
        date: g.date,
        opp_tricode: g.opp_tricode,
        home_away: g.home_away,
      })),
    [games, stat.key]
  )
  const { seasonAvg, windowAvg, delta } = computeAverages(seriesData, windowSize)

  return (
    <div className="trends-team-card">
      <div className="trends-team-card-head">
        <span className="trends-team-card-label">{stat.label}</span>
        <DeltaBadge delta={delta} format={stat.format} inversePositive={!!stat.inversePositive} />
      </div>
      <div className="trends-team-card-values">
        <div><span>Season</span><strong>{formatValue(seasonAvg, stat.format)}</strong></div>
        <div><span>Last {windowSize}</span><strong>{formatValue(windowAvg, stat.format)}</strong></div>
      </div>
      <TrendSparkline
        games={seriesData}
        windowSize={windowSize}
        format={stat.format}
        color={stat.color}
        height={56}
      />
    </div>
  )
}

function PlayerTrendRow({ player, windowSize }) {
  return (
    <div className="trends-player-row">
      <div className="trends-player-name">{player.name}</div>
      {PLAYER_STATS.map((stat) => {
        const seriesData = player.games.map((g) => ({
          value: g[stat.key],
          date: g.date,
          opp_tricode: g.opp_tricode,
          home_away: g.home_away,
        }))
        const { seasonAvg, windowAvg, delta } = computeAverages(seriesData, windowSize)
        return (
          <div key={stat.key} className="trends-player-cell">
            <div className="trends-player-cell-top">
              <span className="trends-cell-season">{formatValue(seasonAvg, stat.format)}</span>
              <DeltaBadge delta={delta} format={stat.format} inversePositive={false} />
            </div>
            <TrendSparkline
              games={seriesData}
              windowSize={windowSize}
              format={stat.format}
              color={stat.color}
              height={36}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Compute season average + last-N average + delta (window minus season) for a
 * series. Nulls skipped. Returns nulls if there isn't enough data.
 */
function computeAverages(series, windowSize) {
  const nonNull = series.filter((d) => d.value != null)
  if (nonNull.length === 0) return { seasonAvg: null, windowAvg: null, delta: null }
  const seasonAvg =
    nonNull.reduce((a, b) => a + b.value, 0) / nonNull.length
  const windowStart = Math.max(0, series.length - windowSize)
  const windowNonNull = series.slice(windowStart).filter((d) => d.value != null)
  const windowAvg = windowNonNull.length
    ? windowNonNull.reduce((a, b) => a + b.value, 0) / windowNonNull.length
    : null
  const delta = windowAvg != null && seasonAvg != null ? windowAvg - seasonAvg : null
  return { seasonAvg, windowAvg, delta }
}

/**
 * Small green/red delta pill. For most stats, positive delta is good
 * (TS% up = good). For defensive rating or TOV% in future, we'd pass
 * `inversePositive` so a positive delta reads as bad.
 */
function DeltaBadge({ delta, format, inversePositive = false }) {
  if (delta == null) return <span className="trend-delta trend-delta-neutral">—</span>
  const isUp = delta > 0
  const good = inversePositive ? !isUp : isUp
  const cls =
    Math.abs(delta) < epsilonFor(format)
      ? 'trend-delta-neutral'
      : good
      ? 'trend-delta-good'
      : 'trend-delta-bad'
  const sign = isUp ? '▲' : '▼'
  return (
    <span className={`trend-delta ${cls}`}>
      {sign} {formatValue(Math.abs(delta), format).replace('+', '')}
    </span>
  )
}

function epsilonFor(format) {
  if (format === 'pct') return 0.005 // 0.5pp
  if (format === 'rating') return 0.5
  return 0.3
}
