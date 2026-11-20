/**
 * Per-player next-game projections.
 *
 * Two entry points:
 *   - projectPlayer({...}) — single player, Phase 1 + 2 math.
 *   - projectRoster({...}) — whole roster, adds Phase 3 (teammate-out
 *     usage redistribution) on top of the per-player baselines.
 *
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
 * Nov 20 — Phase 4 shipped:
 *   - Rest/B2B adjustment: starters (projected MIN > 28) get docked by 5%
 *     when the Hawks are on the second night of a back-to-back.
 *   - Home-court adjustment: PTS and 3PM get scaled by ±1.4% (roughly
 *     matches the team-level ±1.5-pt HCA split in predictions.js; at a
 *     ~110 team ppg that's ~1.36%).
 *
 * Future (Phase 6+, see claude/advanced-metrics-plan.md):
 *   - Per-position opponent DRtg (vs guards / wings / bigs separately)
 *   - Multi-year player-vs-opponent historical splits
 *   - Bayesian smoothing on small samples
 *   - Lineup-aware projections
 *   - Load-management prediction
 *
 * Realistic bar for this model: materially better than season averages
 * because recent form + opponent + known injuries are all baked in; well
 * short of sportsbook-grade projections (which have multi-year data +
 * ML models + player-tracking features we don't have).
 */

const PER_36_BLEND = { season: 0.7, lastN: 0.3 }
const LAST_N_WINDOW = 10
const QUESTIONABLE_MIN_MULTIPLIER = 0.6

// Nov 20 (Phase 4): rest & home-court adjustments.
//
// B2B_STARTER_MIN_THRESHOLD — minimum projected MIN for a player to count as
// a "starter" for the purpose of B2B rest-day docking. 28 picks up the
// starting 5 + usually the top sixth man; bench players don't get docked
// because in reality coaches often INCREASE bench minutes on B2Bs to spare
// the stars. See the Nov 20 decision in advanced-metrics-plan.md.
const B2B_STARTER_MIN_THRESHOLD = 28

// How much of a projected-MIN cut a starter takes on the second night of
// a B2B. 5% picks the low end of the plan's 5-8% range — matches the
// real-world ~1-2 MIN starter reduction observed on B2Bs. Tune later if
// backtest MAE improves with a higher dock.
const B2B_STARTER_MIN_DOCK = 0.05

// Per-stat HCA multiplier for scoring (PTS and 3PM). 1.4% matches the
// team-level ±1.5-pt HCA split in predictions.js (at a ~110 team ppg,
// 1.5/110 ≈ 1.36%). Only applied to scoring stats; REB / AST / STL / BLK
// are HCA-agnostic in the real world.
const HCA_SCORING_MULTIPLIER = 0.014

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
  // Scaling by opp OPP_TOV: teams that force more TOVs on their
  // opponents also force more TOVs out of our player. (Semantic flip
  // from the other offensive stats — same direction of multiplier
  // though: higher opp value = higher projected TOV for the player.)
  tov:   { field: 'opp_tov',      side: 'offense' },
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
  // Phase 3 inputs — defaults are pass-through (no redistribution):
  extraMinutes = 0,         // Minutes absorbed from Out teammates
  usageBoostFactor = 1,     // Multiplier on PTS/3PM/AST/TOV per-36 rates
  // Phase 4 inputs — defaults are pass-through (no rest / HCA adjustment):
  hawksAreHome = true,      // true = home, false = away. HCA on PTS/3PM.
  hawksOnB2B = false,       // true iff Hawks played last night. Docks starter MIN.
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

  // Phase 3: absorb minutes left by Out teammates. Cap at 40 — NBA
  // rotation players rarely exceed that even in a blowout.
  projectedMin = Math.min(40, projectedMin + extraMinutes)

  // Phase 4 — Rest/B2B dock. Starters (>28 projected MIN) lose 5% of their
  // minutes when the Hawks are on the second night of a back-to-back.
  // Bench players are untouched since coaches actually LENGTHEN benches on
  // B2Bs to spare the stars. Threshold check uses projected MIN AFTER
  // Phase 3 redistribution, so a bench player who absorbed a star's
  // minutes is correctly treated as a starter for that game.
  if (hawksOnB2B && projectedMin > B2B_STARTER_MIN_THRESHOLD) {
    projectedMin = projectedMin * (1 - B2B_STARTER_MIN_DOCK)
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

  // Stats whose per-36 rates scale with usage share (i.e. with how many
  // shots + playmaking touches the player gets). REB/STL/BLK depend more
  // on minutes + opponent than on usage, so they don't get the boost.
  const USAGE_DRIVEN = new Set(['pts', 'fg3m', 'ast', 'tov'])

  for (const stat of stats) {
    const rate36 = per36(stat)
    const usageMult = USAGE_DRIVEN.has(stat) ? usageBoostFactor : 1
    const base = rate36 * usageMult * projectedMin / 36 * paceAdj

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

  // Phase 4 — Home-court adjustment on scoring stats. Mirrors the team-
  // level ±1.5-pt HCA in predictions.js at the player scale.
  const hcaMult = hawksAreHome ? 1 + HCA_SCORING_MULTIPLIER : 1 - HCA_SCORING_MULTIPLIER
  projection.pts  = projection.pts  * hcaMult
  projection.fg3m = projection.fg3m * hcaMult

  return {
    ...projection,
    dnp: false,
    dnpReason: null,
    injuryStatus, injuryReason,
  }
}


// Phase 3 — Teammate-Out usage redistribution. See the roadmap in
// claude/advanced-metrics-plan.md for the full spec.
// -------------------------------------------------------------------

// Rotation-player threshold: a player with baseline projected MIN at or
// above this count as a "key" player, worth flagging in the UI warning
// when they're Out. Below this is deep-bench DNP territory — their
// absence doesn't materially change how the game is played.
const KEY_PLAYER_MIN_THRESHOLD = 20

// Fraction of the minutes/usage vacated by Out teammates that actually
// transfers to remaining players. Not 100% because: some of a star's
// usage is good-shot creation that just disappears when they're not
// there; some lost rebounds go to the opponent instead of teammates;
// some assists just don't happen. Roughly tuned against backtest MAE:
// 0.4 beats 0.5 and 0.3 on PTS/AST. Split minutes and usage separately
// because in practice coaches tighten rotations when several players
// are out — they don't pile all 240 team-minutes onto the healthy guys;
// they play an 8-man rotation at normal minutes instead of a 10-man.
const MINUTE_TRANSFER_COEFFICIENT = 0.75
const USAGE_TRANSFER_COEFFICIENT  = 0.40

// Max minutes a single player will absorb before the cap kicks in.
// NBA rotation players top out around here even in blowouts.
const MINUTE_CAP = 40

// Coarse position bucket. Player positions in hawksData come in forms
// like 'G', 'F', 'C', 'G-F', 'F-C'. We bucket to G/F/C for
// redistribution — a Guard out → Guards absorb minutes first. Dual-
// position players bucket by their primary (first) letter.
function positionBucket(pos) {
  if (!pos) return 'F'  // reasonable default for unknown
  const first = pos.trim().charAt(0).toUpperCase()
  if (first === 'G' || first === 'F' || first === 'C') return first
  return 'F'
}

/**
 * Compute projections for the full Hawks roster in one call, applying
 * Phase 3 teammate-out usage redistribution.
 *
 * @param {object} args
 * @param {Array}  args.players         Hawks players (hawksData.players)
 * @param {object} args.gamesByPid      { player_id: game array } from game_logs
 * @param {object} args.hawksTeam       Hawks entry in league_team_stats
 * @param {object} args.oppTeam         Opponent entry (same shape)
 * @param {object} args.leagueAverages  From computeLeagueAverages()
 * @param {object} args.injuries        { player_id (string): {status, reason} }
 *
 * @returns {object} {
 *   projections: Array of per-player projections (same shape as
 *     projectPlayer returns, one per input player, in input order)
 *   missingKeyPlayers: Array of {name, status, reason} for Out players
 *     whose baseline projected MIN is >= KEY_PLAYER_MIN_THRESHOLD —
 *     used to drive the "projections adjusted for missing teammates"
 *     UI warning.
 *   redistributionApplied: boolean — true iff at least one Out player
 *     contributed minutes or usage to the roster.
 * }
 */
export function projectRoster({
  players, gamesByPid, hawksTeam, oppTeam, leagueAverages, injuries,
  // Phase 4: defaults pass through (no rest/HCA adjustment) so pre-Phase-4
  // callers keep their old behavior until they explicitly opt in.
  hawksAreHome = true, hawksOnB2B = false,
}) {
  // Step 1: compute each player's HEALTHY baseline (no injury). This
  // is the "what would they project at if nothing was wrong" number,
  // needed for both the redistribution math (how many minutes does the
  // Out player vacate?) and the key-player classification.
  const items = players.map((player) => {
    const playerGames = gamesByPid[player.id] || []
    const injury = injuries[String(player.id)] || null
    const healthyBase = projectPlayer({
      player, playerGames, hawksTeam, oppTeam, leagueAverages,
      injury: null,  // IGNORE injury for baseline; we handle it below
      hawksAreHome, hawksOnB2B,
    })
    return { player, playerGames, injury, healthyBase }
  })

  // Step 2: partition into Out vs active. "Active" here means "will play
  // tonight" — includes Questionable/Doubtful (they get reduced MIN but
  // still play). "Out" means we project them at 0 MIN and their minutes/
  // usage get redistributed.
  const outItems    = items.filter((it) => it.injury?.status === 'Out')
  const activeItems = items.filter((it) => it.injury?.status !== 'Out')

  // Step 3: minute redistribution. For each Out player, find same-
  // position active players and give them a share of the Out player's
  // baseline minutes, weighted by their own baseline minutes (coach
  // trusts players already getting rotation minutes).
  const extraMinutesByPid = Object.fromEntries(items.map((it) => [it.player.id, 0]))

  for (const out of outItems) {
    const outMin = out.healthyBase.min
    if (!outMin || outMin <= 0) continue
    const targetBucket = positionBucket(out.player.pos)
    // First try same-position active players with non-zero baseline MIN
    let targets = activeItems.filter((a) =>
      positionBucket(a.player.pos) === targetBucket && a.healthyBase.min > 0
    )
    // Fallback: if no same-position players (small/odd roster), spread
    // across ALL active players with non-zero baseline MIN.
    if (targets.length === 0) {
      targets = activeItems.filter((a) => a.healthyBase.min > 0)
    }
    if (targets.length === 0) continue
    const totalWeight = targets.reduce((s, t) => s + t.healthyBase.min, 0)
    for (const t of targets) {
      const share = t.healthyBase.min / totalWeight
      extraMinutesByPid[t.player.id] += outMin * share * MINUTE_TRANSFER_COEFFICIENT
    }
  }

  // Step 4: usage boost factor. Compute the fraction of team minutes
  // leaving the floor via Out players; that times the transfer
  // coefficient is how much remaining per-36 usage-driven rates get
  // scaled up. This is applied TEAM-WIDE (not per-position), because
  // when a star is out there's more ball-handling freedom everywhere,
  // not just at that star's position.
  const totalOutMin    = outItems.reduce((s, it) => s + (it.healthyBase.min || 0), 0)
  const totalActiveMin = activeItems.reduce((s, it) => s + (it.healthyBase.min || 0), 0)
  const usageBoostFactor = totalActiveMin > 0
    ? 1 + (totalOutMin / totalActiveMin) * USAGE_TRANSFER_COEFFICIENT
    : 1

  // Step 5: re-run projectPlayer for each with the computed extras.
  // Out players still come through projectPlayer so the DNP row +
  // injury metadata is populated uniformly.
  const projections = items.map((it) => {
    const extra = extraMinutesByPid[it.player.id] || 0
    const proj = projectPlayer({
      player: it.player,
      playerGames: it.playerGames,
      hawksTeam, oppTeam, leagueAverages,
      injury: it.injury,
      extraMinutes: it.injury?.status === 'Out' ? 0 : extra,
      usageBoostFactor: it.injury?.status === 'Out' ? 1 : usageBoostFactor,
      hawksAreHome, hawksOnB2B,
    })
    return { ...proj, player: it.player }
  })

  // Step 6: missing key players — Out players whose healthy baseline
  // MIN crossed the rotation threshold. Drives the UI warning.
  const missingKeyPlayers = outItems
    .filter((it) => (it.healthyBase.min || 0) >= KEY_PLAYER_MIN_THRESHOLD)
    .map((it) => ({
      name: it.player.name,
      status: it.injury?.status || 'Out',
      reason: it.injury?.reason || null,
    }))

  return {
    projections,
    missingKeyPlayers,
    redistributionApplied: totalOutMin > 0,
  }
}
