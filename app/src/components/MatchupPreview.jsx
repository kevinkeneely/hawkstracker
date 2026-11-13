import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Matchup Preview — renders a head-to-head card for the Hawks' next game.
 *
 * "Next game" = the first entry in the schedule whose status isn't Final.
 * Shows the full preview for that game every day until tip-off (per the
 * build-plan decision), so stats update as the opponent plays other games.
 *
 * Data (all current-season — 2026-27):
 *   /schedule-<SEASON>.json         — Hawks schedule, used to find next game
 *   /league_team_stats-<SEASON>.json — 30-team Advanced + FTr snapshot
 *   /league_team_games-<SEASON>.json — per-team game log for recent form
 *
 * Caller (HomePage) decides whether to render this at all based on the
 * active season dropdown: current season only. Archived views hide it.
 */

const SEASON = '2026-27'
const RECENT = 5

// Tricode -> NBA team ID (needed because league_team_games is keyed by id,
// but schedule gives us opp_tricode). Built once from league_team_stats on
// mount so we don't hard-code a 30-entry map.
function buildTricodeIndex(teams) {
  const idByTri = {}
  const teamByTri = {}
  for (const t of teams) {
    idByTri[t.tricode] = t.id
    teamByTri[t.tricode] = t
  }
  return { idByTri, teamByTri }
}

function recentForm(games, n = RECENT) {
  if (!games?.length) return null
  const slice = games.slice(-n)
  const wins = slice.filter((g) => g.won).length
  const avgDiff = slice.reduce((a, g) => a + (g.diff || 0), 0) / slice.length
  return { gp: slice.length, wins, losses: slice.length - wins, avgDiff }
}

const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const fmtNum = (v, d = 1) => (v == null ? '—' : v.toFixed(d))

// Which of the two values is "better" for coloring.
//   LOWER_IS_BETTER: lower value wins (def rtg = fewer points allowed, tov%
//     = fewer giveaways)
//   NEUTRAL: neither direction is categorically good or bad (Pace is just a
//     style choice — fast isn't better than slow). Shown without color.
//   everything else: higher wins.
const LOWER_IS_BETTER = new Set(['def_rating', 'tov_pct'])
const NEUTRAL = new Set(['pace'])

function compareCell(hawksVal, oppVal, key) {
  if (hawksVal == null || oppVal == null) return 'mp-neutral'
  if (NEUTRAL.has(key)) return 'mp-neutral'
  if (hawksVal === oppVal) return 'mp-neutral'
  const hawksBetter = LOWER_IS_BETTER.has(key)
    ? hawksVal < oppVal
    : hawksVal > oppVal
  return hawksBetter ? 'mp-hawks-better' : 'mp-opp-better'
}

// Stat row config — order matches Kevin's requested set.
const STAT_ROWS = [
  { key: 'pace',       label: 'Pace',    format: (v) => fmtNum(v, 1) },
  { key: 'off_rating', label: 'Off Rtg', format: (v) => fmtNum(v, 1) },
  { key: 'def_rating', label: 'Def Rtg', format: (v) => fmtNum(v, 1) },
  { key: 'net_rating', label: 'Net',     format: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`) },
  { key: 'efg_pct',    label: 'eFG%',    format: fmtPct },
  { key: 'tov_pct',    label: 'TOV%',    format: fmtPct },
  { key: 'oreb_pct',   label: 'OReb%',   format: fmtPct },
  { key: 'fta_rate',   label: 'FTr',     format: (v) => fmtNum(v, 3) },
]

export default function MatchupPreview() {
  const [sched, setSched] = useState(null)
  const [stats, setStats] = useState(null)
  const [gamesByTeam, setGamesByTeam] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/schedule-${SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_stats-${SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_games-${SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([s, st, gt]) => {
        if (cancelled) return
        setSched(s)
        setStats(st)
        setGamesByTeam(gt?.games_by_team || null)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const nextGame = useMemo(() => {
    const games = sched?.games || []
    // status_code: 1 = upcoming, 2 = live, 3 = Final. First non-Final is next.
    return games.find((g) => g.status_code !== 3) || null
  }, [sched])

  if (error || !sched || !stats || !gamesByTeam) {
    // Silent — matchup preview is nice-to-have, don't break the page
    return null
  }
  if (!nextGame) {
    // Season over or schedule not yet published
    return null
  }

  const { idByTri, teamByTri } = buildTricodeIndex(stats.teams)
  const hawksStats = teamByTri['ATL']
  const oppStats = teamByTri[nextGame.opp_tricode]
  if (!hawksStats || !oppStats) return null

  const hawksId = idByTri['ATL']
  const oppId = idByTri[nextGame.opp_tricode]
  const hawksForm = recentForm(gamesByTeam[String(hawksId)])
  const oppForm = recentForm(gamesByTeam[String(oppId)])

  // Pretty-print the game date. The ISO date in the schedule is in ET
  // (NBA's local). Parse manually to avoid timezone drift on the client.
  const [y, m, d] = nextGame.date.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const vsAt = nextGame.home_away === 'home' ? 'vs' : '@'

  return (
    <section className="mp-section">
      <header className="mp-head">
        <div className="mp-head-left">
          <span className="mp-eyebrow">Next Game</span>
          <h2 className="mp-title">
            Hawks {vsAt} {nextGame.opp_name || nextGame.opp_tricode}
          </h2>
          <span className="mp-when">{dateLabel} · {nextGame.status || 'TBD'}</span>
        </div>
      </header>

      {/* Head-to-head stats */}
      <div className="mp-h2h">
        <table className="mp-table">
          <thead>
            <tr>
              <th className="mp-col-team" style={{ textAlign: 'right' }}>ATL</th>
              <th className="mp-col-stat">Stat</th>
              <th className="mp-col-team" style={{ textAlign: 'left' }}>{nextGame.opp_tricode}</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map((row) => {
              const h = hawksStats[row.key]
              const o = oppStats[row.key]
              const cls = compareCell(h, o, row.key)
              return (
                <tr key={row.key}>
                  <td className={`mp-val ${cls === 'mp-hawks-better' ? 'mp-better' : cls === 'mp-opp-better' ? 'mp-worse' : ''}`}
                      style={{ textAlign: 'right' }}>
                    {row.format(h)}
                  </td>
                  <td className="mp-label">{row.label}</td>
                  <td className={`mp-val ${cls === 'mp-opp-better' ? 'mp-better' : cls === 'mp-hawks-better' ? 'mp-worse' : ''}`}
                      style={{ textAlign: 'left' }}>
                    {row.format(o)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Recent form — last 5 games each */}
      <div className="mp-form-row">
        <RecentFormBlock label="ATL last 5" form={hawksForm} />
        <RecentFormBlock label={`${nextGame.opp_tricode} last 5`} form={oppForm} />
      </div>
    </section>
  )
}

function RecentFormBlock({ label, form }) {
  if (!form || !form.gp) {
    return (
      <div className="mp-form-block mp-form-empty">
        <span className="mp-form-label">{label}</span>
        <span className="mp-form-sub">no games yet</span>
      </div>
    )
  }
  const diffColor = form.avgDiff > 0 ? 'mp-better' : form.avgDiff < 0 ? 'mp-worse' : ''
  const diffSign = form.avgDiff > 0 ? '+' : ''
  return (
    <div className="mp-form-block">
      <span className="mp-form-label">{label}</span>
      <div className="mp-form-row-inner">
        <span className="mp-form-record">{form.wins}-{form.losses}</span>
        <span className={`mp-form-diff ${diffColor}`}>
          {diffSign}{form.avgDiff.toFixed(1)} avg diff
        </span>
      </div>
    </div>
  )
}
