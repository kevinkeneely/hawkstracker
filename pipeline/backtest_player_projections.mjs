/**
 * Backtest the player-projection model against actual Hawks game outcomes.
 *
 * For every completed Hawks game this season, this script replays the
 * projection as it would have run 24 hours before that game (using only
 * games BEFORE that date), compares each Hawks player's projected stat
 * line to their actual box score, and aggregates mean absolute error
 * (MAE) per stat across all player-games.
 *
 * Output: app/public/projection_backtest-<season>.json
 * Schema: {
 *   season, generated_at,
 *   n_games, n_player_games, n_excluded_dnp, n_excluded_no_prior_games,
 *   mae: { min, pts, reb, ast, fg3m, stl, blk, tov },
 *   sample_count_per_stat: { ... },
 *   notes: string[]  (e.g. "Using current league_team_stats for games
 *                     before snapshotting started on YYYY-MM-DD")
 * }
 *
 * Why Node / why reuse the frontend JS lib: the projection math already
 * lives in app/src/lib/playerProjections.js. Porting it to Python would
 * mean two implementations to keep in sync forever. Running the same
 * module from Node ensures the backtest MAE is for THE model the user
 * sees, not a reimplementation of it.
 *
 * DNP exclusion: games where a player's actual MIN was 0 (DNP — coach's
 * decision, injury, trade, g-league assignment, etc.) are excluded from
 * the MAE. The projection model isn't trying to predict last-minute
 * lineup decisions, and including them would inflate MAE for reasons
 * that aren't the model's fault.
 *
 * Opponent-stats time context: we use point-in-time snapshots from
 * app/public/league_team_stats_history/<season>/<YYYY-MM-DD>.json where
 * they exist (snapshotting started 2026-11-18). For games before the
 * snapshot series began, we fall back to the current league_team_stats
 * — flagged in the output's `notes` array.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  projectRoster, computeLeagueAverages,
} from '../app/src/lib/playerProjections.js'
import { isOnB2B } from '../app/src/lib/schedule.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const SEASON = '2026-27'
const HAWKS_TEAM_ID = 1610612737

const PUBLIC = (p) => join(ROOT, 'app/public', p)

// --- Load current-day data ---------------------------------------------
const hawksData = JSON.parse(readFileSync(PUBLIC(`hawksData-${SEASON}.json`), 'utf8'))
const gameLogs  = JSON.parse(readFileSync(PUBLIC(`game_logs-${SEASON}.json`), 'utf8'))
const curStats  = JSON.parse(readFileSync(PUBLIC(`league_team_stats-${SEASON}.json`), 'utf8'))

// --- Enumerate dated snapshots ---------------------------------------
// Each file is league_team_stats_history/<SEASON>/<YYYY-MM-DD>.json —
// the full teams array as it stood on that cron date. We pick the newest
// snapshot whose date is < the game being replayed.
const HISTORY_DIR = PUBLIC(`league_team_stats_history/${SEASON}`)
let snapshotDates = []
if (existsSync(HISTORY_DIR)) {
  snapshotDates = readdirSync(HISTORY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace('.json', ''))
    .sort()
}

function statsAsOf(dateIso) {
  // Find the newest snapshot strictly before dateIso.
  let pick = null
  for (const d of snapshotDates) {
    if (d < dateIso) pick = d
    else break
  }
  if (pick) {
    return JSON.parse(readFileSync(join(HISTORY_DIR, `${pick}.json`), 'utf8'))
  }
  return null  // no snapshot older than dateIso — caller falls back
}

// --- Build per-player game log lookup --------------------------------
const gamesByPid = Object.fromEntries(
  (gameLogs.players || []).map((p) => [p.id, p.games])
)
const playerMetaById = Object.fromEntries(
  hawksData.players.map((p) => [p.id, p])
)

// --- Hawks team game list ---------------------------------------------
// gameLogs.team.games is the chronological list of Hawks team games this
// season — one entry per game, with { game_id, date, opp_tricode,
// home_away, won, ... }. We walk these in order.
const teamGames = (gameLogs.team?.games || [])
  .slice()
  .sort((a, b) => a.date.localeCompare(b.date))

// --- Walk & backtest --------------------------------------------------
const STATS = ['min', 'pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'tov']
const absErrors = Object.fromEntries(STATS.map((s) => [s, []]))
let nPlayerGames = 0
let nDnpExcluded = 0
let nNoPrior = 0
let nFellBackToCurrent = 0
const notes = []

for (const game of teamGames) {
  const gameDate = game.date
  const oppTricode = game.opp_tricode
  const hawksAreHome = game.home_away === 'home'

  // Pick league_team_stats as of this game. If no snapshot that old,
  // fall back to current — a slight cheat for early-season games that
  // we flag in `notes`.
  let teamStats = statsAsOf(gameDate)
  if (!teamStats) {
    teamStats = curStats
    nFellBackToCurrent++
  }
  const hawksTeam = teamStats.teams.find((t) => t.id === HAWKS_TEAM_ID)
  const oppTeam   = teamStats.teams.find((t) => t.tricode === oppTricode)
  if (!hawksTeam || !oppTeam) continue
  const leagueAverages = computeLeagueAverages(teamStats.teams)

  // Phase 3: infer which Hawks players were "Out" for this specific game
  // by checking who DIDN'T appear in its box score. Imperfect — a healthy
  // DNP-CD looks the same as Out on a box score — but good enough to
  // feed projectRoster's teammate-out redistribution for the backtest.
  // Each Hawks player not listed in the night's box score becomes an
  // Out injury entry so projectRoster redistributes their baseline MIN.
  const playersInBox = new Set()
  for (const player of hawksData.players) {
    const allGames = gamesByPid[player.id] || []
    const g = allGames.find((x) => x.date === gameDate)
    if (g && g.min > 0) playersInBox.add(player.id)
  }
  const syntheticInjuries = {}
  for (const player of hawksData.players) {
    if (!playersInBox.has(player.id)) {
      // Only mark as Out if the player had meaningful history by that
      // game date — otherwise a rookie whose first game is still ahead
      // gets incorrectly treated as "Out" rather than "not yet on team".
      const prior = (gamesByPid[player.id] || []).filter((g) => g.date < gameDate)
      if (prior.length >= 2) {
        syntheticInjuries[String(player.id)] = {
          status: 'Out', reason: 'Backtest-inferred (absent from box score)',
        }
      }
    }
  }

  // Build per-player prior-game lists for THIS backtest date. projectRoster
  // expects `gamesByPid` of games BEFORE the projection point.
  const priorGamesByPid = {}
  for (const player of hawksData.players) {
    priorGamesByPid[player.id] = (gamesByPid[player.id] || []).filter((g) => g.date < gameDate)
  }

  // Phase 4 (Nov 20): dock Hawks starters on B2B + apply HCA on scoring.
  // hawksAreHome is already computed above from game.home_away.
  // teamGames is the Hawks' full season game list — isOnB2B just needs
  // to find a game the day before gameDate.
  const hawksOnB2B = isOnB2B(teamGames, gameDate)

  const { projections } = projectRoster({
    players: hawksData.players,
    gamesByPid: priorGamesByPid,
    hawksTeam, oppTeam, leagueAverages,
    injuries: syntheticInjuries,
    hawksAreHome,
    hawksOnB2B,
  })

  for (const proj of projections) {
    const player = proj.player
    const allGames = gamesByPid[player.id] || []
    const prior = allGames.filter((g) => g.date < gameDate)
    if (prior.length === 0) {
      nNoPrior++
      continue
    }
    const actual = allGames.find((g) => g.date === gameDate)
    if (!actual) continue  // Player didn't appear in box score at all
    if (!actual.min || actual.min === 0) {
      // DNP — excluded by design (coach's decision, injury, etc.)
      nDnpExcluded++
      continue
    }

    if (proj.dnp) continue  // Model projected 0 min (Out); skip

    nPlayerGames++
    for (const stat of STATS) {
      const p = proj[stat]
      const act = actual[stat]
      if (p == null || act == null) continue
      absErrors[stat].push(Math.abs(p - act))
    }
  }
}

// --- Aggregate --------------------------------------------------------
const mae = {}
const sampleCount = {}
for (const stat of STATS) {
  const vals = absErrors[stat]
  mae[stat] = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null
  sampleCount[stat] = vals.length
}

if (nFellBackToCurrent > 0) {
  notes.push(
    `${nFellBackToCurrent} of ${teamGames.length} games used current ` +
    `league_team_stats (no point-in-time snapshot available; snapshotting ` +
    `started ${snapshotDates[0] || '(none yet)'})`
  )
}
if (nDnpExcluded > 0) {
  notes.push(`${nDnpExcluded} player-games excluded (DNP / 0 MIN actual)`)
}

const out = {
  season: SEASON,
  generated_at: new Date().toISOString(),
  n_games: teamGames.length,
  n_player_games: nPlayerGames,
  n_excluded_dnp: nDnpExcluded,
  n_excluded_no_prior_games: nNoPrior,
  mae,
  sample_count_per_stat: sampleCount,
  notes,
}

writeFileSync(PUBLIC(`projection_backtest-${SEASON}.json`), JSON.stringify(out, null, 2))
console.log(`[backtest] wrote app/public/projection_backtest-${SEASON}.json`)
console.log(`[backtest] ${nPlayerGames} player-games across ${teamGames.length} team games`)
console.log(`[backtest] MAE:`, mae)
if (notes.length) notes.forEach((n) => console.log(`[backtest]   note: ${n}`))
