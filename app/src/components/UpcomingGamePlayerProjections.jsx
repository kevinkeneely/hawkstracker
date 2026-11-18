import { useEffect, useMemo, useState } from 'react'
import { projectPlayer, computeLeagueAverages } from '../lib/playerProjections'

const CURRENT_SEASON = '2026-27'
const HAWKS_TEAM_ID = 1610612737

/**
 * Per-Hawks-player projection table for an upcoming game. Renders below
 * the team prediction block (UpcomingGamePrediction).
 *
 * 7 stats: MIN / PTS / REB / AST / 3PM / STL / BLK. (TOV pending — raw turnover count not in game_logs yet; only tov_pct rate.)
 * - Single-number decimals (e.g. 31.3 MIN, 21.6 PTS).
 * - Sticky Player column, header row + player column visually tinted.
 * - Players flagged Out in the NBA injury report show with "DNP" + 🏥.
 * - Rows sorted by projected MIN descending (rotation on top, bench at
 *   bottom, DNPs last).
 *
 * See lib/playerProjections.js for projection math and the plan doc
 * (claude/advanced-metrics-plan.md "Upcoming Game Prediction" section) for
 * the roadmap — this is Phase 1 + 2 of a 5-phase build; Phases 3–5 add
 * teammate-out usage redistribution, rest/B2B adjustments, and backtest
 * calibration.
 */
export default function UpcomingGamePlayerProjections({ oppTricode, season = CURRENT_SEASON }) {
  const [hawksData, setHawksData] = useState(null)
  const [gameLogs,  setGameLogs]  = useState(null)
  const [teamStats, setTeamStats] = useState(null)
  const [injuries,  setInjuries]  = useState({})

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/hawksData-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/game_logs-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_stats-${season}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/injuries-${season}.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([h, g, t, i]) => {
        if (cancelled) return
        setHawksData(h)
        setGameLogs(g)
        setTeamStats(t)
        setInjuries(i?.players || {})
      })
      .catch(() => {}) // Optional block — never break the page
    return () => { cancelled = true }
  }, [season])

  const rows = useMemo(() => {
    if (!hawksData || !gameLogs || !teamStats) return null
    const hawksTeam = teamStats.teams.find((t) => t.id === HAWKS_TEAM_ID)
    const oppTeam   = teamStats.teams.find((t) => t.tricode === oppTricode)
    if (!hawksTeam || !oppTeam) return null
    const leagueAverages = computeLeagueAverages(teamStats.teams)
    const gamesByPid = Object.fromEntries(
      (gameLogs.players || []).map((p) => [p.id, p.games])
    )

    const projected = hawksData.players.map((player) => ({
      player,
      ...projectPlayer({
        player,
        playerGames: gamesByPid[player.id] || [],
        hawksTeam,
        oppTeam,
        leagueAverages,
        injury: injuries[String(player.id)] || null,
      }),
    }))

    // Sort: non-DNP rotation (by MIN desc) first, then DNP rows last.
    return projected.sort((a, b) => {
      if (a.dnp && !b.dnp) return 1
      if (!a.dnp && b.dnp) return -1
      return (b.min ?? -1) - (a.min ?? -1)
    })
  }, [hawksData, gameLogs, teamStats, injuries, oppTricode])

  if (!rows) return null

  return (
    <section className="ugpp-section" aria-label="Player projections">
      <h3 className="ugpp-title">Player projections</h3>
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
                  <td colSpan={7} className="ugpp-dnp-cell">
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
    </section>
  )
}

function fmt(v) {
  if (v == null) return '—'
  return v.toFixed(1)
}
