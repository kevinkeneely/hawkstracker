import { Link } from 'react-router-dom'
import TrendSparkline from './TrendSparkline'

/**
 * Form Watch — a short row of "who's trending up/down right now" cards.
 *
 * For each Hawks player, computes their Last-5-game average minus their
 * season average for each tracked stat. Ranks by magnitude relative to a
 * per-stat threshold ("exceedance"). Picks the top 3 hot + top 2 cold and
 * renders as linked cards with a mini sparkline.
 *
 * Data source: /game_logs-<season>.json (loaded in App.jsx as `gameLogs`).
 */

// The eight stats we watch. `key` is the field name on each game entry;
// `format` matches TrendSparkline's formatter; `label` is the chip text;
// `threshold` is the deviation magnitude at which a streak becomes a
// "callout" — expressed in the stat's natural units (points, pp, etc.).
// All starting values — tune after we see what the widget surfaces.
const WATCH_STATS = [
  { key: 'pts',     label: 'PPG',  format: 'num', threshold: 3.0 },
  { key: 'reb',     label: 'RPG',  format: 'num', threshold: 1.5 },
  { key: 'ast',     label: 'APG',  format: 'num', threshold: 1.5 },
  { key: 'stl',     label: 'SPG',  format: 'num', threshold: 0.7 },
  { key: 'blk',     label: 'BPG',  format: 'num', threshold: 0.5 },
  { key: 'ts_pct',  label: 'TS%',  format: 'pct', threshold: 0.04, skipKey: 'fga' },
  { key: 'efg_pct', label: 'eFG%', format: 'pct', threshold: 0.04, skipKey: 'fga' },
  { key: 'fg3_pct', label: '3P%',  format: 'pct', threshold: 0.06, skipKey: 'fg3a' },
]

const WINDOW = 5
const MIN_GAMES = 3  // need at least this many games played to be eligible

function mean(xs) {
  if (!xs.length) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Compute every eligible (player, stat) candidate and its deviation.
 * Returns an array of { player, stat, seasonAvg, windowAvg, delta,
 * exceedance } where exceedance = delta / threshold (so values > 1 mean
 * "beyond the trigger magnitude").
 */
function computeCandidates(players) {
  const out = []
  for (const p of players) {
    const games = p.games || []
    if (games.length < MIN_GAMES) continue
    const window = games.slice(-WINDOW)
    if (window.length < MIN_GAMES) continue
    for (const stat of WATCH_STATS) {
      // Season values: drop nulls; for % stats, drop zero-attempt games too.
      const seasonVals = games
        .filter((g) => g[stat.key] != null && (!stat.skipKey || g[stat.skipKey] > 0))
        .map((g) => g[stat.key])
      const windowVals = window
        .filter((g) => g[stat.key] != null && (!stat.skipKey || g[stat.skipKey] > 0))
        .map((g) => g[stat.key])
      if (seasonVals.length < MIN_GAMES || windowVals.length < MIN_GAMES) continue
      const seasonAvg = mean(seasonVals)
      const windowAvg = mean(windowVals)
      if (seasonAvg == null || windowAvg == null) continue
      const delta = windowAvg - seasonAvg
      const exceedance = delta / stat.threshold
      // Must at least clear 1.0× threshold in magnitude to be a callout
      if (Math.abs(exceedance) < 1) continue
      out.push({ player: p, stat, seasonAvg, windowAvg, delta, exceedance })
    }
  }
  return out
}

/**
 * Pick 3 hottest + 2 coldest from the candidate pool, with a one-per-player
 * cap so a single streaky player doesn't take over the row.
 */
function pickCallouts(candidates) {
  const byPlayer = new Map()
  for (const c of candidates) {
    const cur = byPlayer.get(c.player.id)
    // Keep the player's single most-extreme (by |exceedance|) candidate
    if (!cur || Math.abs(c.exceedance) > Math.abs(cur.exceedance)) {
      byPlayer.set(c.player.id, c)
    }
  }
  const deduped = [...byPlayer.values()]
  const hot = deduped.filter((c) => c.exceedance > 0).sort((a, b) => b.exceedance - a.exceedance)
  const cold = deduped.filter((c) => c.exceedance < 0).sort((a, b) => a.exceedance - b.exceedance)
  // Target: 3 hot + 2 cold, but backfill from the other side if we come up short.
  const picked = []
  picked.push(...hot.slice(0, 3))
  picked.push(...cold.slice(0, 2))
  if (picked.length < 5) {
    const extra = picked.length < 5 ? (hot.slice(3).concat(cold.slice(2))).sort(
      (a, b) => Math.abs(b.exceedance) - Math.abs(a.exceedance),
    ) : []
    picked.push(...extra.slice(0, 5 - picked.length))
  }
  return picked
}

function formatValue(v, format) {
  if (v == null) return '—'
  if (format === 'pct') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}

function formatDelta(delta, format) {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : ''
  if (format === 'pct') return `${sign}${(delta * 100).toFixed(1)}pp`
  return `${sign}${delta.toFixed(1)}`
}

function FormWatchCard({ callout }) {
  const { player, stat, seasonAvg, windowAvg, delta } = callout
  const isHot = delta > 0
  const stateClass = isHot ? 'form-watch-hot' : 'form-watch-cold'
  const sparkColor = isHot ? 'var(--rank-good-text)' : 'var(--rank-bad-text)'
  // Sparkline series: null out zero-attempt games on % stats so a non-shooting
  // night doesn't dip the line to 0% (same pattern as PlayerTrendRow).
  const series = (player.games || []).map((g) => ({
    value: stat.skipKey && !(g[stat.skipKey] > 0) ? null : g[stat.key],
    date: g.date,
    opp_tricode: g.opp_tricode,
    home_away: g.home_away,
  }))
  return (
    <Link
      to={`/players/${player.id}?tab=trend`}
      className={`form-watch-card ${stateClass}`}
    >
      <div className="form-watch-card-head">
        <span className="form-watch-player">{player.name}</span>
        <span className="form-watch-stat">{stat.label}</span>
      </div>
      <div className="form-watch-values">
        <div className="form-watch-pair">
          <span className="form-watch-pair-label">LAST {WINDOW}</span>
          <strong className="form-watch-pair-value">
            {formatValue(windowAvg, stat.format)}
          </strong>
        </div>
        <div className="form-watch-pair">
          <span className="form-watch-pair-label">SEASON</span>
          <strong className="form-watch-pair-value form-watch-pair-season">
            {formatValue(seasonAvg, stat.format)}
          </strong>
        </div>
        <span className={`form-watch-delta ${isHot ? 'is-hot' : 'is-cold'}`}>
          {isHot ? '▲' : '▼'} {formatDelta(delta, stat.format).replace(/^[+-]/, '')}
        </span>
      </div>
      <TrendSparkline
        games={series}
        windowSize={WINDOW}
        format={stat.format}
        color={sparkColor}
        height={36}
      />
    </Link>
  )
}

export default function FormWatchRow({ gameLogs }) {
  if (!gameLogs?.players) return null
  const players = gameLogs.players
  const candidates = computeCandidates(players)
  const callouts = pickCallouts(candidates)
  if (!callouts.length) {
    return (
      <section className="form-watch-section">
        <div className="form-watch-head">
          <h2>Form Watch</h2>
          <span className="form-watch-sub">Last {WINDOW} games vs season</span>
        </div>
        <p className="form-watch-empty">
          Not enough game data yet to surface notable streaks. Check back after a few more games.
        </p>
      </section>
    )
  }
  return (
    <section className="form-watch-section">
      <div className="form-watch-head">
        <h2>Form Watch</h2>
        <span className="form-watch-sub">Last {WINDOW} games vs season</span>
      </div>
      <div className="form-watch-row">
        {callouts.map((c) => (
          <FormWatchCard key={`${c.player.id}-${c.stat.key}`} callout={c} />
        ))}
      </div>
    </section>
  )
}
