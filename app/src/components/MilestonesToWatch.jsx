import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * MilestonesToWatch — career milestones Hawks players are chasing this season.
 *
 * Two milestone types (so far — franchise records come later once the
 * Basketball Reference tables are in hand):
 *
 *   1. Round-number career milestones (10k career PTS, 500 career 3PM, etc.)
 *   2. Personal bests (projected season total beats the player's career-high season)
 *
 * For each Hawks player with GP ≥ 5, we project their season total using the
 * same formula as PaceProjections (current_total + per_game × games_remaining),
 * then compare to:
 *   - the next round-number tier above their career total
 *   - their best single-season total ever
 *
 * A milestone is "on pace" if the projected season total gets them there.
 * We rank by closest-to-happening (smallest "games needed") so the most
 * imminent chases bubble to the top.
 *
 * Reads: /hawksData-<SEASON>.json  (player.career.totals + player.career.best_season)
 */

const CURRENT_SEASON = '2026-27'
const MIN_GP = 5
const FULL_SEASON_GP = 82
const MAX_ROWS = 12

// Round-number career tiers for each stat. The widget picks the lowest tier
// a player hasn't passed yet. Tiers deliberately skip really-small ones so
// rookies don't flood the list with "needs 10 more AST for 100 career".
const TIERS = {
  pts:  [1000, 5000, 10000, 15000, 20000, 25000, 30000],
  reb:  [1000, 2500, 5000, 7500, 10000],
  ast:  [500, 1000, 2500, 5000, 7500, 10000],
  stl:  [250, 500, 1000, 1500, 2000],
  blk:  [250, 500, 1000, 1500, 2000],
  fg3m: [500, 1000, 1500, 2000, 2500],
}

// Metadata per stat — label the card shows, hawksData field names for
// current-season total and per-game. Same shape as PaceProjections'
// STATS so projectStat stays consistent.
const STATS = [
  { key: 'pts',  label: 'points',       total: 'pts_total',  perGame: 'ppg' },
  { key: 'reb',  label: 'rebounds',     total: 'reb_total',  perGame: 'rpg' },
  { key: 'ast',  label: 'assists',      total: 'ast_total',  perGame: 'apg' },
  { key: 'stl',  label: 'steals',       total: 'stl_total',  perGame: 'spg' },
  { key: 'blk',  label: 'blocks',       total: 'blk_total',  perGame: 'bpg' },
  { key: 'fg3m', label: '3-pointers',   total: 'fg3m_total', perGame: null  },
]

/** Smart per-game projection for the rest of the season. */
function projectedRemaining(player, stat) {
  if ((player.gp ?? 0) < MIN_GP) return null
  const curTotal = player[stat.total]
  if (curTotal == null) return null
  const perGame = stat.perGame != null
    ? player[stat.perGame]
    : curTotal / player.gp
  if (perGame == null || Number.isNaN(perGame)) return null
  const gamesRemaining = Math.max(0, FULL_SEASON_GP - player.gp)
  return { perGame, remaining: perGame * gamesRemaining, curSeasonTotal: curTotal }
}

/** Next round-number tier above a career total, or null if past the top tier. */
function nextTier(stat, careerTotal) {
  if (careerTotal == null) return null
  const tiers = TIERS[stat.key] ?? []
  return tiers.find((t) => t > careerTotal) ?? null
}

/** Build the full list of in-reach milestones. */
function buildMilestones(players) {
  const rows = []

  for (const p of players) {
    const career = p.career
    if (!career) continue
    const totals = career.totals ?? {}
    const bestBy = career.best_season ?? {}

    for (const stat of STATS) {
      const proj = projectedRemaining(p, stat)
      if (!proj) continue
      // Games needed at the current pace (we display this when < 82).
      const gamesNeededFor = (target) => {
        if (proj.perGame <= 0) return Infinity
        return Math.max(0, Math.ceil(target / proj.perGame))
      }

      // --- Round-number career tier ---
      const careerSoFar = totals[stat.key]
      const tier = nextTier(stat, careerSoFar)
      if (tier != null && careerSoFar != null) {
        const needed = tier - careerSoFar - proj.curSeasonTotal
        // If needed ≤ 0 they've already passed it this season (nothing to chase).
        // If needed > projected-remaining they aren't on pace.
        if (needed > 0 && needed <= proj.remaining) {
          rows.push({
            kind: 'career-tier',
            player: p,
            stat,
            needed: Math.ceil(needed),
            target: tier,
            // "games needed" counts from today's remaining-game pace.
            games: gamesNeededFor(needed),
            sortKey: gamesNeededFor(needed),
          })
        }
      }

      // --- Personal best (best single-season total ever) ---
      const best = bestBy[stat.key]
      if (best && best.value != null && formatSeason(best.season) !== CURRENT_SEASON) {
        const needed = best.value - proj.curSeasonTotal + 1  // +1 to actually beat it
        if (needed > 0 && needed <= proj.remaining) {
          rows.push({
            kind: 'personal-best',
            player: p,
            stat,
            needed: Math.ceil(needed),
            target: best.value,
            prevSeason: best.season,
            games: gamesNeededFor(needed),
            sortKey: gamesNeededFor(needed) + 100,  // rank personal bests below career tiers when both apply
          })
        }
      }
    }
  }

  return rows.sort((a, b) => a.sortKey - b.sortKey).slice(0, MAX_ROWS)
}

function formatSeason(seasonId) {
  // SEASON_ID like "22026" (regular season = "2" + YYYY) or "2026-27" — handle both.
  if (!seasonId) return ''
  if (seasonId.includes('-')) return seasonId
  if (seasonId.length === 5 && seasonId.startsWith('2')) {
    const start = parseInt(seasonId.slice(1), 10)
    return `${start}-${String(start + 1).slice(-2)}`
  }
  return seasonId
}

function describe(row) {
  const name = <Link to={`/players/${row.player.id}`} className="milestone-name">{row.player.name}</Link>
  if (row.kind === 'career-tier') {
    return (
      <>
        {name} — <strong>{row.needed.toLocaleString()}</strong>{' '}
        more {row.stat.label} for <strong>{row.target.toLocaleString()}</strong> career
      </>
    )
  }
  // personal-best
  return (
    <>
      {name} — <strong>career-high {row.stat.label}</strong> on pace to pass{' '}
      <strong>{row.target.toLocaleString()}</strong> ({formatSeason(row.prevSeason)})
    </>
  )
}

export default function MilestonesToWatch({ season = CURRENT_SEASON }) {
  const [hawksData, setHawksData] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/hawksData-${season}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setHawksData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [season])

  const rows = useMemo(() => {
    if (!hawksData?.players) return null
    return buildMilestones(hawksData.players)
  }, [hawksData])

  if (!rows) return null

  return (
    <section className="milestones-section" aria-label="Milestones to watch">
      <div className="milestones-head">
        <h2>Milestones to watch</h2>
        <span className="milestones-sub">
          On pace to reach this season — career round numbers and personal bests
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="milestones-empty">No milestones within reach yet — check back after more games.</div>
      ) : (
        <ul className="milestones-list">
          {rows.map((row, i) => (
            <li key={`${row.player.id}-${row.stat.key}-${row.kind}-${i}`} className={`milestone-row milestone-row--${row.kind}`}>
              <span className="milestone-copy">{describe(row)}</span>
              <span className="milestone-pace">
                {row.games <= 10 ? `~${row.games} games` : `~${row.games} games`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
