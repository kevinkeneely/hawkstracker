/**
 * Per-player next-game projections.
 *
 * Projected stat = per-36 rate × projected MIN / 36, where:
 *   per-36 rate = 70% season + 30% last-10 blend (recent form)
 *   projected MIN = last-10 average MIN
 *
 * Then layered adjustments:
 *   - Pace: scale by (projected game pace / Hawks season pace). Faster
 *     game = more possessions = more raw volume on every counting stat.
 *   - Opponent defense (per stat): scale each stat by how much the
 *     opponent allows vs league average on that specific stat. e.g. PTS
 *     scales by opp_pts / league_avg_opp_pts; 3PM by opp_fg3_pct / league;
 *     REB by opp_reb / league; etc. See STAT_ADJUSTMENTS below for the
 *     per-stat mapping.
 *   - Injuries: Out → projected 0 MIN + DNP flag; Questionable → MIN × 0.6.
 *
 * Future (Phase 3+, see claude/advanced-metrics-plan.md):
 *   - Teammate-out usage redistribution (if a high-usage Hawks player is
 *     Out, remaining players' per-36 rates & MIN scale up proportionally)
 *   - Rest / back-to-back adjustment (dock starters when Hawks played
 *     last night)
 *   - Backtest & calibrate against historical game results
 *   - Multi-season per-matchup splits
 *
 * Realistic bar for this model: materially better than season averages
 * because recent form + opponent + known injuries are all baked in; well
 * short of sportsbook-grade projections (which have multi-year data +
 * ML models + player-tracking features we don't have).
 */

const PER_36_BLEND = { season: 0.7, lastN: 0.3 }
const LAST_N_WINDOW = 10
const QUESTIONABLE_MIN_MULTIPLIER = 0.6

// Per-stat opponent adjustment. Each entry names the opponent-stats field
// to look up on the opp team and the direction of the scaling:
//   "offense" means "my player is doing this on offense, and a weaker
//      opponent defense increases it" → scale directly by opp.<field>
//   "defense" means "my player is doing this on defense, and a weaker
//      opponent offense also increases it" → scale by opp.<field>
// Keeping the sign explicit guards against future confusion.
const STAT_ADJUSTMENTS = {
  pts:   { field: 'opp_pts',      side: 'offense' },  // opp lets up more pts → more pts
  reb:   { field: 'opp_reb',      side: 'offense' },  // opp lets up more reb opportunities
  ast:   { field: 'opp_ast',      side: 'offense' },  // opp lets up more assists
  fg3m:  { field: 'opp_fg3_pct',  side: 'offense' },  // opp lets 3s go in at a higher rate
  tov:   { field: 'opp_tov',      side: 'offense' },  // opp forces more TOV on their opponents
  // Defensive stats: scale by opponent's offensive sloppiness.
  stl:   { field: 'opp_tov',      side: 'defense' },  // opp loses the ball more → more STL for us
  blk:   { field: 'opp_fg_pct',   side: 'defense', invert: true },
                                                      // opp has LOWER FG% → more blocks against them
}

// Helper: safe-divide, clamp runaway adjustment multipliers so a terrible
// defense doesn't blow a projection to 2x. Reality: even against the
// worst defense in the league vs the best, a counting stat rarely shifts
// more than ±20% from a player's own baseline.
function clamp(x, lo = 0.75, hi = 1.25) {
  if (!isFinite(x) || x <= 0) return 1
  return Math.max(lo, Math.min(hi, x))
}

function mean(arr) {
  const vals = arr.filter((v) => v != null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * Compute league averages for each opponent-stat field we use, across all
 * 30 teams. Pure computation on league_team_stats-*.json.
 */
export function computeLeagueAverages(teams) {
  const out = {}
  for (const key of ['opp_pts', 'opp_reb', 'opp_ast', 'opp_stl',
                     'opp_blk', 'opp_tov', 'opp_fg_pct', 'opp_fg3_pct']) {
    out[key] = mean(teams.map((t) => t[key]))
  }
  return out
}

/**
 * Project a single Hawks player's next-game stat line.
 *
 * Returns null for the stat line but still reports status if the player
 * has no game logs this season (preseason callups, two-way guys). Callers
 * should render the row with DNP flag.
 *
 * @param {object} args
 * @param {object} args.player         Player record from hawksData
 * @param {Array}  args.playerGames    Games for this player from game_logs
 * @param {object} args.hawksTeam      Hawks team entry from league_team_stats
 * @param {object} args.oppTeam        Opponent team entry (same shape)
 * @param {object} args.leagueAverages From computeLeagueAverages()
 * @param {object|null} args.injury    { status, reason } or null
 * @returns {object} { min, pts, reb, ast, fg3m, stl, blk, tov,
 *                     dnp, dnpReason, injuryStatus, injuryReason }
 */
export function projectPlayer({
  player, playerGames, hawksTeam, oppTeam, leagueAverages, injury,
}) {
  const injuryStatus = injury?.status || null
  const injuryReason = injury?.reason || null

  // Hard DNP for Out — zero projection, flag in the row.
  if (injuryStatus === 'Out') {
    return {
      min: 0, pts: 0, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, tov: 0,
      dnp: true,
      dnpReason: injuryReason || 'Out',
      injuryStatus, injuryReason,
    }
  }

  // No game data at all (rookie yet to play, deep bench) — show them in
  // the table but with dashes instead of a zero projection. Different
  // semantic from "projected to not play" (an Out player gets 0 explicitly).
  if (!playerGames || playerGames.length === 0) {
    return {
      min: null, pts: null, reb: null, ast: null, fg3m: null, stl: null, blk: null, tov: null,
      dnp: true, dnpReason: 'No game data yet',
      injuryStatus, injuryReason,
    }
  }

  // Base MIN: last-N average (or all games if fewer).
  const lastN = playerGames.slice(-LAST_N_WINDOW)
  const lastNMin = mean(lastN.map((g) => g.min)) ?? 0
  const seasonMin = mean(playerGames.map((g) => g.min)) ?? 0
  let projectedMin = lastNMin

  // Questionable: project reduced MIN as a conservative hedge.
  if (injuryStatus === 'Questionable' || injuryStatus === 'Doubtful') {
    projectedMin *= QUESTIONABLE_MIN_MULTIPLIER
  }

  // Per-36 blend for each stat. Players with zero MIN in some games
  // (DNP) are excluded from per-36 computation so one DNP doesn't crush
  // their rate.
  function per36(stat) {
    const seasonGames = playerGames.filter((g) => g.min > 0)
    const lastNGames  = lastN.filter((g) => g.min > 0)
    const seasonRate = seasonGames.length
      ? (mean(seasonGames.map((g) => g[stat])) / mean(seasonGames.map((g) => g.min))) * 36
      : 0
    const lastNRate = lastNGames.length
      ? (mean(lastNGames.map((g) => g[stat])) / mean(lastNGames.map((g) => g.min))) * 36
      : seasonRate
    return PER_36_BLEND.season * seasonRate + PER_36_BLEND.lastN * lastNRate
  }

  // Pace adjustment: faster game = more possessions = more volume.
  const projectedPace = (hawksTeam.pace + oppTeam.pace) / 2
  const paceAdj = projectedPace / hawksTeam.pace

  // Compute each stat's projection
  const stats = ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'tov']
  const projection = { min: projectedMin }

  for (const stat of stats) {
    const rate36 = per36(stat)
    const base = rate36 * projectedMin / 36 * paceAdj

    // Opponent adjustment
    const adj = STAT_ADJUSTMENTS[stat]
    let oppMult = 1
    if (adj && oppTeam[adj.field] != null && leagueAverages[adj.field]) {
      let ratio = oppTeam[adj.field] / leagueAverages[adj.field]
      if (adj.invert) ratio = 1 / ratio
      oppMult = clamp(ratio)
    }

    projection[stat] = base * oppMult
  }

  return {
    ...projection,
    dnp: false,
    dnpReason: null,
    injuryStatus, injuryReason,
  }
}
