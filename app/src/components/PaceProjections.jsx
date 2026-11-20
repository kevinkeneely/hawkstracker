import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Pace Projections — "on pace for X" widget.
 *
 * For every Hawks player with GP ≥ 5, projects their season total for each
 * counting stat using the "smart" formula:
 *
 *   projected_total = current_total + (current_per_game × games_remaining)
 *                     where games_remaining = 82 - gp
 *
 * Ranks the Hawks by projected total for each stat, shows the top player's
 * projection as a highlight card. 7 cards (PTS / REB / AST / STL / BLK / 3PM
 * / TOV) in a responsive grid.
 *
 * Nov 20: ships Phase A (just projections). Phase B will add milestone
 * annotations below each number — "would set a Hawks season record" /
 * "needs X more to reach 10k career" — once the B3 data file lands.
 */

const CURRENT_SEASON = '2026-27'
const MIN_GP = 5
const FULL_SEASON_GP = 82

// Each card describes one stat we project. `total` is the hawksData field
// holding the player's current season total; `perGame` is the field holding
// their per-game average. All 7 stats show the HIGHEST projected total —
// for TOV, "highest" is the noteworthy callout (who's turnover-prone), not
// the lowest (would just be the bench player who plays fewest minutes).
const STATS = [
  { key: 'pts', label: 'Points',    total: 'pts_total',  perGame: 'ppg'  },
  { key: 'reb', label: 'Rebounds',  total: 'reb_total',  perGame: 'rpg'  },
  { key: 'ast', label: 'Assists',   total: 'ast_total',  perGame: 'apg'  },
  { key: 'stl', label: 'Steals',    total: 'stl_total',  perGame: 'spg'  },
  { key: 'blk', label: 'Blocks',    total: 'blk_total',  perGame: 'bpg'  },
  { key: 'fg3m', label: '3-pointers', total: 'fg3m_total', perGame: null }, // compute per-game from total/gp
  { key: 'tov', label: 'Turnovers', total: 'tov_total',  perGame: 'tov' },  // highest projected — who's turnover-prone, the interesting callout
]

/**
 * Smart projection: current total + per-game × games remaining.
 * Returns null if the player hasn't played enough or the data is missing.
 */
function projectStat(player, stat) {
  if ((player.gp ?? 0) < MIN_GP) return null
  const curTotal = player[stat.total]
  if (curTotal == null) return null

  // Pull per-game. Most stats have a dedicated field (ppg, rpg, etc); 3PM
  // doesn't, so compute from total/gp.
  const perGame = stat.perGame != null
    ? player[stat.perGame]
    : curTotal / player.gp
  if (perGame == null || Number.isNaN(perGame)) return null

  const gamesRemaining = Math.max(0, FULL_SEASON_GP - player.gp)
  return curTotal + perGame * gamesRemaining
}

export default function PaceProjections({ season = CURRENT_SEASON }) {
  const [hawksData, setHawksData] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/hawksData-${season}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setHawksData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [season])

  // Build one card per stat: find the Hawks player with the best projected
  // season total (lowest for TOV, highest for everything else).
  const cards = useMemo(() => {
    if (!hawksData?.players) return null
    return STATS.map((stat) => {
      const ranked = hawksData.players
        .map((p) => ({ player: p, projected: projectStat(p, stat) }))
        .filter((r) => r.projected != null)
        .sort((a, b) => stat.invert
          ? a.projected - b.projected
          : b.projected - a.projected)
      const top = ranked[0] ?? null
      return { stat, top }
    })
  }, [hawksData])

  if (!cards) return null

  return (
    <section className="pace-section" aria-label="Pace projections">
      <div className="pace-head">
        <h2>Season pace</h2>
        <span className="pace-sub">
          On pace for — current totals + per-game average over remaining games
        </span>
      </div>
      <div className="pace-grid">
        {cards.map(({ stat, top }) => (
          <div key={stat.key} className="pace-card">
            <div className="pace-card-stat">{stat.label}</div>
            {top ? (
              <>
                <Link to={`/players/${top.player.id}`} className="pace-card-player">
                  {top.player.name}
                </Link>
                <div className="pace-card-value">{Math.round(top.projected)}</div>
                <div className="pace-card-perGame">
                  {stat.perGame != null
                    ? Number(top.player[stat.perGame]).toFixed(1)
                    : Number(top.player[stat.total] / top.player.gp).toFixed(1)}{' '}
                  per game
                </div>
              </>
            ) : (
              <div className="pace-card-empty">—</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
