import { useEffect, useMemo, useState } from 'react'
import { projectRoster, computeLeagueAverages } from '../lib/playerProjections'
import { isOnB2B } from '../lib/schedule'

const CURRENT_SEASON = '2026-27'
const HAWKS_TEAM_ID = 1610612737

/**
 * Per-Hawks-player projection table for an upcoming game. Renders below
 * the team prediction block (UpcomingGamePrediction).
 *
 * 8 stats: MIN / PTS / REB / AST / 3PM / STL / BLK / TOV.
 * - Single-number decimals (e.g. 31.3 MIN, 21.6 PTS).
 * - Sticky Player column, header row + player column visually tinted.
 * - Players flagged Out in the NBA injury report show with "DNP" + 🏥.
 * - Rows sorted by projected MIN descending (rotation on top, bench at
 *   bottom, DNPs last).
 *
 * See lib/playerProjections.js for projection math and the plan doc
 * (claude/advanced-metrics-plan.md "Upcoming Game Prediction" section) for
 * the roadmap. As of Nov 20 this ships Phases 1 + 2 + 3 + 4 + 5:
 *   Phase 1 — baseline per-36 blend + pace adjustment
 *   Phase 2 — per-stat opponent-defense adjustments
 *   Phase 3 — teammate-out usage redistribution
 *   Phase 4 — rest/B2B dock on starters + HCA on scoring  (new)
 *   Phase 5 — backtest + MAE line below the table
 */
export default function UpcomingGamePlayerProjections({ oppTricode, gameDate, hawksAreHome = true, season = CURRENT_SEASON }) {
  const [hawksData,   setHawksData]   = useState(null)
  const [gameLogs,    setGameLogs]    = useState(null)
  const [teamStats,   setTeamStats]   = useState(null)
  const [injuries,    setInjuries]    = useState({})
  const [backtest,    setBacktest]    = useState(null)
  // Phase 4 — league team games, keyed by team_id → array of games.
  // Used to detect whether Hawks or opp played the day before this game.
  const [leagueGames, setLeagueGames] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/hawksData-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/game_logs-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_stats-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/injuries-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/projection_backtest-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_games-${season}.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([h, g, t, i, b, lg]) => {
        if (cancelled) return
        setHawksData(h)
        setGameLogs(g)
        setTeamStats(t)
        setInjuries(i?.players || {})
        setBacktest(b)
        setLeagueGames(lg?.games_by_team || null)
      })
      .catch(() => {}) // Optional block — never break the page
    return () => { cancelled = true }
  }, [season])

  // Roster projection (Phase 1+2+3). projectRoster returns both the
  // per-player projections AND Phase-3 context (which key players are
  // Out, whether any redistribution was applied) so the warning
  // subline can render.
  const roster = useMemo(() => {
    if (!hawksData || !gameLogs || !teamStats) return null
    const hawksTeam = teamStats.teams.find((t) => t.id === HAWKS_TEAM_ID)
    const oppTeam   = teamStats.teams.find((t) => t.tricode === oppTricode)
    if (!hawksTeam || !oppTeam) return null
    const leagueAverages = computeLeagueAverages(teamStats.teams)
    const gamesByPid = Object.fromEntries(
      (gameLogs.players || []).map((p) => [p.id, p.games])
    )

    // Phase 4 — detect back-to-back for both teams from league_team_games.
    // Falls back to false if league_team_games hasn't loaded yet or
    // gameDate wasn't passed in — projectRoster defaults keep the old
    // behavior in that case.
    const hawksOnB2B = (leagueGames && gameDate)
      ? isOnB2B(leagueGames[HAWKS_TEAM_ID], gameDate)
      : false

    const { projections, missingKeyPlayers, redistributionApplied } = projectRoster({
      players: hawksData.players,
      gamesByPid,
      hawksTeam,
      oppTeam,
      leagueAverages,
      injuries,
      hawksAreHome,
      hawksOnB2B,
    })

    // Sort: non-DNP rotation first by projected MIN desc, DNP rows last.
    const sorted = projections.slice().sort((a, b) => {
      if (a.dnp && !b.dnp) return 1
      if (!a.dnp && b.dnp) return -1
      return (b.min ?? -1) - (a.min ?? -1)
    })

    return { rows: sorted, missingKeyPlayers, redistributionApplied }
  }, [hawksData, gameLogs, teamStats, injuries, oppTricode, leagueGames, gameDate, hawksAreHome])

  const rows = roster?.rows

  if (!rows) return null

  return (
    <section className="ugpp-section" aria-label="Player projections">
      <h3 className="ugpp-title">Player projections</h3>
      {roster?.missingKeyPlayers?.length > 0 && (
        <p className="ugpp-missing-warning">
          ⚠ Projections adjusted for missing teammates:{' '}
          {roster.missingKeyPlayers.map((p) => p.name).join(', ')}
        </p>
      )}
      <div className="ugpp-table-wrap">
        <table className="ugpp-table">
          <thead>
            <tr>
              <th className="ugpp-col-player">Player</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>3PM</th>
              <th>STL</th>
              <th>BLK</th>
              <th>TOV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player.id} className={r.dnp ? 'ugpp-row-dnp' : ''}>
                <td className="ugpp-col-player">
                  {r.player.name}
                  {r.injuryStatus && (
                    <span
                      className="ugpp-injury-icon"
                      title={r.injuryReason ? `${r.injuryStatus} — ${r.injuryReason}` : r.injuryStatus}
                      aria-label={`Injury: ${r.injuryStatus}`}
                    >
                      🏥
                    </span>
                  )}
                </td>
                {r.dnp ? (
                  <td colSpan={8} className="ugpp-dnp-cell">
                    DNP {r.dnpReason ? `— ${r.dnpReason}` : ''}
                  </td>
                ) : (
                  <>
                    <td>{fmt(r.min)}</td>
                    <td>{fmt(r.pts)}</td>
                    <td>{fmt(r.reb)}</td>
                    <td>{fmt(r.ast)}</td>
                    <td>{fmt(r.fg3m)}</td>
                    <td>{fmt(r.stl)}</td>
                    <td>{fmt(r.blk)}</td>
                    <td>{fmt(r.tov)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ugpp-note">
        Blends 70% season + 30% last-10 per-36 rates, projected minutes from
        last-10 average, pace &amp; opponent-defense adjusted. Out players
        show as DNP. Early-season samples are noisy.
      </p>
      {backtest && backtest.n_player_games > 0 && (
        <p className="ugpp-mae">
          Model accuracy over {backtest.n_games} games
          ({backtest.n_player_games} player-games):
          MAE {formatMae(backtest.mae)}.
        </p>
      )}
    </section>
  )
}

function fmt(v) {
  if (v == null) return '—'
  return v.toFixed(1)
}

// MAE line: wrap the 8-stat line in the same visual order as the table
// columns. "±X.X PTS" etc. Nulls drop out so a sparse stat doesn't
// render "±null".
const MAE_ORDER = [
  ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['fg3m', '3PM'],
  ['stl', 'STL'], ['blk', 'BLK'], ['tov', 'TOV'], ['min', 'MIN'],
]
function formatMae(mae) {
  return MAE_ORDER
    .filter(([k]) => mae[k] != null)
    .map(([k, label]) => `±${mae[k].toFixed(1)} ${label}`)
    .join(', ')
}
