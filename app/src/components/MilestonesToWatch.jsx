import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * MilestonesToWatch — career and franchise milestones Hawks players
 * are chasing this season. Four milestone types:
 *
 *   1. career-tier          — round-number LIFETIME totals (10k PTS, etc.)
 *                             uses player.career.totals (all-team lifetime)
 *   2. personal-best        — career-high single-season (any team)
 *                             uses player.career.best_season
 *   3. franchise-career-rank — projected to crack top-10 Hawks ALL-TIME
 *                              uses player.career.hawks_totals
 *   4. franchise-season-rank — projected to crack top-10 Hawks SINGLE-SEASON
 *                              uses /franchiseRecords.json season leaders
 *
 * Decisions baked in (Kevin, 2026-11-21):
 *  - Own-record defender: only surface if projection > prior record (Option C)
 *  - Rate stats: only shown once player has qualified by BR thresholds (Option 2)
 *  - UI: show 10 rows by default, "Show all" button to expand (Option expandable)
 */

const CURRENT_SEASON = '2026-27'
const MIN_GP = 5
// Triple-doubles are low-denominator; projecting from 2 TDs in 10 games
// at `td/gp * remaining` is noisy. Require a bigger sample than other
// stats (10 games vs the normal 5) before we surface a TD milestone.
const MIN_GP_FOR_TD = 10
const FULL_SEASON_GP = 82
const COLLAPSED_ROWS = 10

// Lifetime round-number tiers for each counting stat (career-tier type).
const TIERS = {
  pts:  [1000, 5000, 10000, 15000, 20000, 25000, 30000],
  reb:  [1000, 2500, 5000, 7500, 10000],
  ast:  [500, 1000, 2500, 5000, 7500, 10000],
  stl:  [250, 500, 1000, 1500, 2000],
  blk:  [250, 500, 1000, 1500, 2000],
  fg3m: [500, 1000, 1500, 2000, 2500],
}

// Counting-stat definitions. `total` = current-season total field in hawksData.
// `perGame` is the per-game rate field; null means divide total by gp.
// `franchiseKey` is the key under franchiseRecords.career/season.
// `careerHawksKey` is the key under player.career.hawks_totals.
const COUNTING_STATS = [
  { key: 'pts',  label: 'points',       total: 'pts_total',  perGame: 'ppg', franchiseKey: 'pts',  careerHawksKey: 'pts'  },
  { key: 'reb',  label: 'rebounds',     total: 'reb_total',  perGame: 'rpg', franchiseKey: 'reb',  careerHawksKey: 'reb'  },
  { key: 'ast',  label: 'assists',      total: 'ast_total',  perGame: 'apg', franchiseKey: 'ast',  careerHawksKey: 'ast'  },
  { key: 'stl',  label: 'steals',       total: 'stl_total',  perGame: 'spg', franchiseKey: 'stl',  careerHawksKey: 'stl'  },
  { key: 'blk',  label: 'blocks',       total: 'blk_total',  perGame: 'bpg', franchiseKey: 'blk',  careerHawksKey: 'blk'  },
  { key: 'fg3m', label: '3-pointers',   total: 'fg3m_total', perGame: null,  franchiseKey: 'fg3m', careerHawksKey: 'fg3m' },
  { key: 'fgm',  label: 'field goals',  total: 'fgm_total',  perGame: null,  franchiseKey: 'fgm',  careerHawksKey: 'fgm'  },
  { key: 'ftm',  label: 'free throws',  total: 'ftm_total',  perGame: null,  franchiseKey: 'ftm',  careerHawksKey: 'ftm'  },
  { key: 'tov',  label: 'turnovers',    total: 'tov_total',  perGame: 'tov', franchiseKey: 'tov',  careerHawksKey: 'tov'  },
  // Triple-doubles: only the franchise-season rank milestone applies here.
  // We have current-season TD3 (from leaguedashplayerstats) but no career
  // per-season TD breakdown, so career-tier, personal-best, and
  // franchise-career-rank are all skipped for this stat via the `only` key.
  // `perGame` is null (TDs aren't an accumulating per-game rate); projection
  // falls back to curTotal/gp which gives the right shape for a rare-event
  // stat. Minimum-GP floor is MIN_GP_FOR_TD, not MIN_GP (handled below).
  { key: 'triple_doubles', label: 'triple-doubles', total: 'td3_total', perGame: null, franchiseKey: 'triple_doubles', careerHawksKey: null, only: ['franchise-season'], minGp: 10 },
]

// Rate-stat definitions.
//   seasonRate = hawksData field for the current-season rate value (0-1).
//   seasonQual(player) = does the player meet the season qualification right now?
//   careerQual(hawks_totals) = does their Hawks-career meet the career qualification?
//   careerRate(hawks_totals) = compute their Hawks-career rate from totals (0-1).
const RATE_STATS = [
  {
    key: 'fg_pct',  label: 'FG%',
    seasonRate: 'fg_pct',
    seasonQual: (p) => (p.fgm_total ?? 0) >= 300,
    careerQual: (h) => (h.fgm ?? 0) >= 500,
    careerRate: (h) => (h.fga && h.fga > 0) ? h.fgm / h.fga : null,
    franchiseKey: 'fg_pct',
  },
  {
    key: 'fg3_pct', label: '3P%',
    seasonRate: 'fg3_pct',
    seasonQual: (p) => (p.fg3m_total ?? 0) >= 82,
    careerQual: (h) => (h.fg3m ?? 0) >= 50,
    careerRate: (h) => (h.fg3a && h.fg3a > 0) ? h.fg3m / h.fg3a : null,
    franchiseKey: 'fg3_pct',
  },
  {
    key: 'ft_pct',  label: 'FT%',
    seasonRate: 'ft_pct',
    seasonQual: (p) => (p.ftm_total ?? 0) >= 125,
    careerQual: (h) => (h.ftm ?? 0) >= 200,
    careerRate: (h) => (h.fta && h.fta > 0) ? h.ftm / h.fta : null,
    franchiseKey: 'ft_pct',
  },
  {
    key: 'ts_pct',  label: 'TS%',
    seasonRate: 'ts_pct',
    seasonQual: (p) => {
      // TS% season qualification is 500 TSA; TSA = FGA + 0.44*FTA
      const tsa = (p.fga_total ?? 0) + 0.44 * (p.fta_total ?? 0)
      return tsa >= 500
    },
    careerQual: (h) => (h.gp ?? 0) >= 100,
    careerRate: (h) => {
      if (!h.pts || !(h.fga || h.fta)) return null
      const tsa = 2 * ((h.fga ?? 0) + 0.44 * (h.fta ?? 0))
      return tsa > 0 ? h.pts / tsa : null
    },
    franchiseKey: 'ts_pct',
  },
  {
    key: 'efg_pct', label: 'eFG%',
    seasonRate: 'efg_pct',
    seasonQual: (p) => (p.fgm_total ?? 0) >= 300,   // mirrors FG%
    careerQual: (h) => (h.fgm ?? 0) >= 500,          // mirrors FG%
    careerRate: (h) => {
      if (!h.fga || h.fga === 0 || h.fgm == null) return null
      return ((h.fgm ?? 0) + 0.5 * (h.fg3m ?? 0)) / h.fga
    },
    franchiseKey: 'efg_pct',
  },
]

// Triple-doubles isn't tracked in hawksData directly. We treat player.jaleen-style
// per-game TD rate as unknown and skip TD personal projections; we still use
// franchise records for TD context if the hawksData ever carries a TD count.
// For Jalen Johnson's active TD-count this season, hawksData would need a `td`
// field — leaving this noted as a follow-up rather than guessing.

/** Smart per-game projection for the rest of the season. */
function projectedRemaining(player, stat) {
  const minGp = stat.minGp ?? MIN_GP
  if ((player.gp ?? 0) < minGp) return null
  const curTotal = player[stat.total]
  if (curTotal == null) return null
  const perGame = stat.perGame != null ? player[stat.perGame] : curTotal / player.gp
  if (perGame == null || Number.isNaN(perGame)) return null
  const gamesRemaining = Math.max(0, FULL_SEASON_GP - player.gp)
  return { perGame, remaining: perGame * gamesRemaining, curSeasonTotal: curTotal }
}

function formatSeason(seasonId) {
  if (!seasonId) return ''
  if (typeof seasonId === 'string' && seasonId.includes('-')) return seasonId
  const s = String(seasonId)
  if (s.length === 5 && s.startsWith('2')) {
    const start = parseInt(s.slice(1), 10)
    return `${start}-${String(start + 1).slice(-2)}`
  }
  return s
}

function nextTier(stat, careerTotal) {
  if (careerTotal == null) return null
  const tiers = TIERS[stat.key] ?? []
  return tiers.find((t) => t > careerTotal) ?? null
}

/** Build every in-reach milestone row for the current roster. */
function buildMilestones(players, franchise) {
  const rows = []

  for (const p of players) {
    const career = p.career
    if (!career) continue
    const totals = career.totals ?? {}
    const hawks = career.hawks_totals ?? {}
    const bestBy = career.best_season ?? {}

    for (const stat of COUNTING_STATS) {
      const proj = projectedRemaining(p, stat)
      if (!proj) continue
      const projSeasonTotal = proj.curSeasonTotal + proj.remaining
      const gamesNeededFor = (target) => {
        if (proj.perGame <= 0) return Infinity
        return Math.max(0, Math.ceil(target / proj.perGame))
      }

      // (1) career-tier — lifetime round numbers
      if (stat.only && !stat.only.includes('career-tier')) {
        /* stat opted out of this milestone type */
      } else {
      const careerSoFar = totals[stat.key]
      const tier = nextTier(stat, careerSoFar)
      if (tier != null && careerSoFar != null) {
        const needed = tier - careerSoFar - proj.curSeasonTotal
        if (needed > 0 && needed <= proj.remaining) {
          rows.push({
            kind: 'career-tier',
            player: p, stat,
            needed: Math.ceil(needed),
            target: tier,
            games: gamesNeededFor(needed),
            sortKey: gamesNeededFor(needed),
          })
        }
      }

      }

      // (2) personal-best — lifetime best single-season (any team)
      if (stat.only && !stat.only.includes('personal-best')) {
        /* stat opted out */
      } else {
      const best = bestBy[stat.key]
      if (best && best.value != null && formatSeason(best.season) !== CURRENT_SEASON) {
        const needed = best.value - proj.curSeasonTotal + 1
        if (needed > 0 && needed <= proj.remaining) {
          rows.push({
            kind: 'personal-best',
            player: p, stat,
            needed: Math.ceil(needed),
            target: best.value,
            prevSeason: best.season,
            games: gamesNeededFor(needed),
            sortKey: gamesNeededFor(needed) + 100,
          })
        }
      }

      }

      // (3) franchise-career-rank — projected Hawks-career crosses a franchise top-10 slot
      if (stat.only && !stat.only.includes('franchise-career')) {
        /* stat opted out */
      } else {
      const franchiseCareer = franchise?.career?.[stat.franchiseKey]
      const hawksCareerSoFar = hawks[stat.careerHawksKey]
      if (Array.isArray(franchiseCareer) && hawksCareerSoFar != null) {
        // Projected Hawks-career total at end of this season.
        const projHawksCareer = hawksCareerSoFar + projSeasonTotal
        // Current rank among franchise top-10 by current Hawks-career totals.
        // (null if they aren't in top 10 currently.)
        const currentRank = findRank(franchiseCareer, hawksCareerSoFar)
        const projectedRank = findRank(franchiseCareer, projHawksCareer)
        // Only show if the projection crosses INTO top 10 or moves UP within it.
        if (projectedRank != null && (currentRank == null || projectedRank < currentRank)) {
          // Who the projection passes: the player at rank (projectedRank - 1) sits above,
          // the one at `projectedRank` (0-indexed) is who they overtook.
          const passed = franchiseCareer[projectedRank]  // the entry they bumped
          const targetValue = passed ? passed[1] : null
          const needed = targetValue != null ? Math.max(0, targetValue + 1 - hawksCareerSoFar - proj.curSeasonTotal) : null
          if (needed != null && needed > 0 && needed <= proj.remaining) {
            rows.push({
              kind: 'franchise-career',
              player: p, stat,
              needed: Math.ceil(needed),
              newRank: projectedRank + 1,  // display rank is 1-indexed
              passedName: passed ? passed[0] : null,
              passedValue: targetValue,
              games: gamesNeededFor(needed),
              sortKey: gamesNeededFor(needed) + 50,
            })
          }
        }
      }

      }

      // (4) franchise-season-rank — projection crosses into franchise top-10 season list
      if (stat.only && !stat.only.includes('franchise-season')) {
        /* stat opted out */
      } else {
      const franchiseSeason = franchise?.season?.[stat.franchiseKey]
      if (Array.isArray(franchiseSeason)) {
        // Which position would projSeasonTotal slot into?
        const projectedSeasonRank = findRank(franchiseSeason, projSeasonTotal)
        if (projectedSeasonRank != null) {
          const passed = franchiseSeason[projectedSeasonRank]
          const targetValue = passed ? passed[1] : null
          const passedName = passed ? passed[0] : null
          const passedSeason = passed ? passed[2] : null

          // Option C: own-record defender — if `passed` is this same player (by name),
          // only show if projSeasonTotal strictly beats passedValue (not just ties).
          const isOwnRecord = passedName === p.name
          const beatsOwn = projSeasonTotal > targetValue + 0.0001
          if (isOwnRecord && !beatsOwn) continue

          // Extended own-record check: if this player already holds a HIGHER
          // slot in the leaderboard (e.g. Jalen Johnson at #1 with 13 TDs
          // in 2025-26), their current-year projection slotting in below
          // that prior season isn't a milestone — it would misleadingly
          // read as "passes <someone> for #2" while they're already #1.
          // Skip when projSeasonTotal is <= any of this player's own
          // earlier (higher-ranked) entries in the leaderboard.
          const hasHigherOwnEntry = franchiseSeason
            .slice(0, projectedSeasonRank)
            .some((e) => e[0] === p.name && e[1] >= projSeasonTotal)
          if (hasHigherOwnEntry) continue

          const needed = targetValue != null ? Math.max(0, targetValue + 1 - proj.curSeasonTotal) : null
          if (needed != null && needed > 0 && needed <= proj.remaining) {
            rows.push({
              kind: 'franchise-season',
              player: p, stat,
              needed: Math.ceil(needed),
              newRank: projectedSeasonRank + 1,
              passedName,
              passedValue: targetValue,
              passedSeason,
              isOwnRecord,
              games: gamesNeededFor(needed),
              sortKey: gamesNeededFor(needed) + 25,
            })
          }
        }
      }
      }
    }

    // (5) rate-stat franchise ranks — only if QUALIFIED (season) or QUALIFIED (career)
    for (const stat of RATE_STATS) {
      const franchiseCareer = franchise?.career?.[stat.franchiseKey]
      const franchiseSeason = franchise?.season?.[stat.franchiseKey]

      // SEASON rate: use current-season rate from hawksData, check qualification.
      if (Array.isArray(franchiseSeason?.leaders) && stat.seasonQual(p)) {
        const rate = p[stat.seasonRate]
        if (rate != null) {
          const rankSlot = findRank(franchiseSeason.leaders, rate)
          if (rankSlot != null) {
            const passed = franchiseSeason.leaders[rankSlot]
            rows.push({
              kind: 'franchise-season-rate',
              player: p, stat,
              currentRate: rate,
              newRank: rankSlot + 1,
              passedName: passed[0],
              passedValue: passed[1],
              passedSeason: passed[2],
              sortKey: 10 + rankSlot,  // rate stats sort near the top (they've already happened)
            })
          }
        }
      }

      // CAREER rate: compute from hawks_totals, check career qualification.
      if (Array.isArray(franchiseCareer?.leaders) && stat.careerQual(hawks)) {
        const rate = stat.careerRate(hawks)
        if (rate != null) {
          const rankSlot = findRank(franchiseCareer.leaders, rate)
          if (rankSlot != null) {
            const passed = franchiseCareer.leaders[rankSlot]
            rows.push({
              kind: 'franchise-career-rate',
              player: p, stat,
              currentRate: rate,
              newRank: rankSlot + 1,
              passedName: passed[0],
              passedValue: passed[1],
              sortKey: 5 + rankSlot,
            })
          }
        }
      }
    }
  }

  return rows.sort((a, b) => a.sortKey - b.sortKey)
}

/** Return the 0-indexed slot `value` would take in a sorted-descending
 *  leaderboard (array of [name, value, ...]), or null if it wouldn't crack it. */
function findRank(leaderboard, value) {
  for (let i = 0; i < leaderboard.length; i++) {
    if (value > leaderboard[i][1]) return i
  }
  return null
}

function nameLink(player) {
  return <Link to={`/players/${player.id}`} className="milestone-name">{player.name}</Link>
}

function describe(row) {
  const name = nameLink(row.player)
  const label = row.stat.label

  switch (row.kind) {
    case 'career-tier':
      return (
        <>
          {name} — <strong>{row.needed.toLocaleString()}</strong>{' '}
          more {label} for <strong>{row.target.toLocaleString()}</strong> career
        </>
      )
    case 'personal-best':
      return (
        <>
          {name} — <strong>career-high {label}</strong> on pace to pass{' '}
          <strong>{row.target.toLocaleString()}</strong> ({formatSeason(row.prevSeason)})
        </>
      )
    case 'franchise-career':
      return (
        <>
          {name} — on pace to pass <strong>{row.passedName}</strong> for{' '}
          <strong>#{row.newRank} all-time Hawks {label}</strong>
        </>
      )
    case 'franchise-season':
      if (row.isOwnRecord) {
        return (
          <>
            {name} — on pace to beat own single-season {label} record (
            <strong>{row.passedValue.toLocaleString()}</strong>, {formatSeason(row.passedSeason)})
          </>
        )
      }
      return (
        <>
          {name} — projection would be <strong>#{row.newRank} all-time Hawks {label}</strong>{' '}
          (past {row.passedName}, {formatSeason(row.passedSeason)})
        </>
      )
    case 'franchise-season-rate':
      return (
        <>
          {name} — currently <strong>#{row.newRank} all-time Hawks season {label}</strong>{' '}
          ({(row.currentRate * 100).toFixed(1)}%)
        </>
      )
    case 'franchise-career-rate':
      return (
        <>
          {name} — <strong>#{row.newRank} all-time Hawks career {label}</strong>{' '}
          ({(row.currentRate * 100).toFixed(1)}%)
        </>
      )
    default:
      return null
  }
}

function paceNote(row) {
  // Rate-stat rows have no "games to reach" — they describe current standing.
  if (row.kind === 'franchise-season-rate' || row.kind === 'franchise-career-rate') {
    return null
  }
  if (row.games == null || !isFinite(row.games)) return null
  return <span className="milestone-pace">~{row.games} games</span>
}

export default function MilestonesToWatch({ season = CURRENT_SEASON }) {
  const [hawksData, setHawksData] = useState(null)
  const [franchise, setFranchise] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/hawksData-${season}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setHawksData(d) })
      .catch(() => {})
    fetch('/franchiseRecords.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setFranchise(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [season])

  const rows = useMemo(() => {
    if (!hawksData?.players || !franchise) return null
    return buildMilestones(hawksData.players, franchise)
  }, [hawksData, franchise])

  if (!rows) return null

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const hiddenCount = Math.max(0, rows.length - COLLAPSED_ROWS)

  return (
    <section className="milestones-section" aria-label="Milestones to watch">
      <div className="milestones-head">
        <h2>Milestones to watch</h2>
        <span className="milestones-sub">
          On pace to reach this season — career round numbers, personal bests, and franchise records
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="milestones-empty">No milestones within reach yet — check back after more games.</div>
      ) : (
        <>
          <ul className="milestones-list">
            {visible.map((row, i) => (
              <li
                key={`${row.player.id}-${row.stat.key}-${row.kind}-${i}`}
                className={`milestone-row milestone-row--${row.kind}`}
              >
                <span className="milestone-copy">{describe(row)}</span>
                {paceNote(row)}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="milestones-expand"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded
                ? `Show less`
                : `Show all ${rows.length} (${hiddenCount} more)`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
