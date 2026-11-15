import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, YAxis, XAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts'
import { BASE_RATING, uniqueGames, runSeason, carryOver, ratingHistoryByDate, ranksOf, expectedHome } from '../lib/elo'

/**
 * Rolling Power Rating — 538-style NBA ELO.
 *
 * Methodology (see lib/elo.js for formulas):
 *   - Run ELO across all of 2025-26's games → end-of-season ratings
 *   - Carry over 75% of that into 2026-27 starting ratings
 *   - Walk 2026-27 games chronologically, snapshotting per-date ratings
 *   - Render:
 *       Header: current ELO, rank, change since last week, expected win% vs avg
 *       Chart:  Hawks' ELO line over the season with league median reference
 *
 * All computed in the browser from the already-published league_team_games
 * files. No new pipeline work — this rides on the data layer we shipped in
 * step 3 of the Advanced Metrics plan.
 */

const CURRENT_SEASON = '2026-27'
const PRIOR_SEASON = '2025-26'
const HAWKS_ID = 1610612737

// Milliseconds in a 7-day span — used for the "last week" header callout.
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

function elo1(n) { return n == null ? '—' : Math.round(n).toLocaleString() }
function pct0(n) { return n == null ? '—' : `${Math.round(n * 100)}%` }

/**
 * Pick the rating-history snapshot closest to N days before `fromDate`
 * (but not after). Used for the "change since last week" delta.
 */
function snapshotNear(history, fromDate, daysAgo) {
  const target = new Date(fromDate).getTime() - daysAgo * 24 * 60 * 60 * 1000
  let best = null
  for (const snap of history) {
    const t = new Date(snap.date).getTime()
    if (t > target) break
    best = snap
  }
  return best
}

export default function RollingPowerRating() {
  const [games25, setGames25] = useState(null)
  const [games26, setGames26] = useState(null)
  const [stats, setStats] = useState(null)  // for tricode lookup
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/league_team_games-${PRIOR_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_games-${CURRENT_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/league_team_stats-${CURRENT_SEASON}.json`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([g25, g26, s]) => {
        if (cancelled) return
        setGames25(g25?.games_by_team || null)
        setGames26(g26?.games_by_team || null)
        setStats(s || null)
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  const data = useMemo(() => {
    if (!games25 || !games26 || !stats) return null
    // 1. End-of-2025-26 ratings
    const games25list = uniqueGames(games25)
    const final25 = runSeason(games25list, {})
    // 2. Carry 75% into 2026-27 starting ratings
    const start26 = carryOver(final25)
    // 3. Walk 2026-27 games and snapshot per date
    const games26list = uniqueGames(games26)
    const { history, finalRatings } = ratingHistoryByDate(games26list, start26)
    // 4. Add a "day zero" baseline snapshot so the chart starts at the
    //    carryover value rather than jumping from nothing on game 1
    if (games26list.length > 0 && history.length > 0) {
      const firstDate = games26list[0].date
      const dayBefore = new Date(firstDate)
      dayBefore.setDate(dayBefore.getDate() - 1)
      const iso = dayBefore.toISOString().slice(0, 10)
      history.unshift({ date: iso, ratings: { ...start26 } })
    }
    return { history, finalRatings, startRatings: start26 }
  }, [games25, games26, stats])

  if (error) return null
  if (!data) {
    return (
      <section className="rpr-section">
        <header className="rpr-head">
          <h3 className="rpr-title">Rolling Power Rating</h3>
          <p className="rpr-sub">Loading ELO…</p>
        </header>
      </section>
    )
  }

  const { history, finalRatings, startRatings } = data
  const idToTri = Object.fromEntries(stats.teams.map((t) => [t.id, t.tricode]))

  // Header values
  const currentElo = finalRatings[HAWKS_ID]
  const startingElo = startRatings[HAWKS_ID]
  const ranks = ranksOf(finalRatings)
  const currentRank = ranks[HAWKS_ID]
  const totalTeams = Object.keys(finalRatings).length

  const latestDate = history[history.length - 1]?.date
  const weekAgoSnap = latestDate ? snapshotNear(history, latestDate, 7) : null
  const weekAgoRanks = weekAgoSnap ? ranksOf(weekAgoSnap.ratings) : null
  const weekAgoElo = weekAgoSnap?.ratings[HAWKS_ID]
  const weekAgoRank = weekAgoRanks?.[HAWKS_ID]
  const rankChange = weekAgoRank != null ? weekAgoRank - currentRank : null  // positive = climbed
  const eloChange = weekAgoElo != null ? currentElo - weekAgoElo : null

  // Expected win% vs an average team on neutral court (HCA = 0):
  //   expectedHome treats the first arg as home with +100 HCA. For a
  //   neutral-court expectation, call it with hawks as the "away" team so
  //   the +100 goes to the opposing side — nope, that reverses meaning.
  //   Cleaner: compute directly without HCA.
  const expVsAvg = 1 / (1 + Math.pow(10, -(currentElo - BASE_RATING) / 400))

  // Chart data — flatten to { date, hawks_elo, median_elo }
  const chartData = history.map((snap) => {
    const vals = Object.values(snap.ratings)
    const sorted = [...vals].sort((a, b) => a - b)
    const mid = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[(sorted.length - 1) / 2]
    return {
      date: snap.date,
      hawks: snap.ratings[HAWKS_ID],
      median: mid,
    }
  })

  const seasonHigh = Math.max(...chartData.map((d) => d.hawks))
  const seasonLow = Math.min(...chartData.map((d) => d.hawks))

  // Current top-5 by ELO for context (used in tooltip / league strip V2)
  const topFive = Object.entries(finalRatings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, elo]) => ({ tri: idToTri[id] || '?', elo: Math.round(elo) }))

  return (
    <section className="rpr-section">
      <header className="rpr-head">
        <div>
          <h3 className="rpr-title">Rolling Power Rating</h3>
          <p className="rpr-sub">
            FiveThirtyEight-style ELO — margin-weighted, opponent-adjusted,
            with 75% carryover from 2025-26.
          </p>
        </div>
      </header>

      <div className="rpr-kpis">
        <div className="rpr-kpi">
          <span className="rpr-kpi-label">Current ELO</span>
          <span className="rpr-kpi-value">{elo1(currentElo)}</span>
          {eloChange != null && (
            <span className={`rpr-kpi-delta ${eloChange >= 0 ? 'is-up' : 'is-down'}`}>
              {eloChange >= 0 ? '▲' : '▼'} {Math.abs(Math.round(eloChange))} since last week
            </span>
          )}
        </div>
        <div className="rpr-kpi">
          <span className="rpr-kpi-label">League rank</span>
          <span className="rpr-kpi-value">#{currentRank}<span className="rpr-kpi-sub"> of {totalTeams}</span></span>
          {rankChange != null && rankChange !== 0 && (
            <span className={`rpr-kpi-delta ${rankChange > 0 ? 'is-up' : 'is-down'}`}>
              {rankChange > 0 ? '▲' : '▼'} {Math.abs(rankChange)} spot{Math.abs(rankChange) === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="rpr-kpi">
          <span className="rpr-kpi-label">Win% vs avg team</span>
          <span className="rpr-kpi-value">{pct0(expVsAvg)}</span>
          <span className="rpr-kpi-sub-text">on neutral court</span>
        </div>
        <div className="rpr-kpi">
          <span className="rpr-kpi-label">Season range</span>
          <span className="rpr-kpi-value">{elo1(seasonLow)}–{elo1(seasonHigh)}</span>
          <span className="rpr-kpi-sub-text">started {elo1(startingElo)}</span>
        </div>
      </div>

      <div className="rpr-chart" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              tickFormatter={(d) => {
                const [, m, day] = d.split('-')
                return `${+m}/${+day}`
              }}
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              domain={['dataMin - 20', 'dataMax + 20']}
              width={44}
            />
            <ReferenceLine y={BASE_RATING} stroke="var(--text)" strokeOpacity={0.35} strokeDasharray="3 4"
                           label={{ value: 'Avg', position: 'right', fill: 'var(--text-dim)', fontSize: 10 }} />
            <Line type="monotone" dataKey="median" stroke="var(--text)" strokeOpacity={0.35}
                  strokeWidth={1.5} dot={false} isAnimationActive={false} name="League median" />
            <Line type="monotone" dataKey="hawks" stroke="#e03a3e" strokeWidth={2.25}
                  dot={false} activeDot={{ r: 3, fill: '#e03a3e' }} isAnimationActive={false}
                  name="Hawks" />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const hawks = payload.find((p) => p.dataKey === 'hawks')?.value
                const median = payload.find((p) => p.dataKey === 'median')?.value
                const [y, m, day] = label.split('-')
                return (
                  <div className="rpr-tooltip">
                    <div className="rpr-tt-date">{+m}/{+day}/{y.slice(2)}</div>
                    <div className="rpr-tt-row">
                      <span className="rpr-tt-sw" style={{ background: '#e03a3e' }} />
                      Hawks <strong>{Math.round(hawks)}</strong>
                    </div>
                    <div className="rpr-tt-row rpr-tt-dim">
                      <span className="rpr-tt-sw rpr-tt-sw-median" />
                      League median <strong>{Math.round(median)}</strong>
                    </div>
                  </div>
                )
              }}
              cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rpr-footer">
        <span className="rpr-footer-label">Top 5 right now:</span>
        {topFive.map((t, i) => (
          <span key={t.tri} className={`rpr-pill ${t.tri === 'ATL' ? 'is-hawks' : ''}`}>
            #{i + 1} {t.tri} <span className="rpr-pill-elo">{t.elo}</span>
          </span>
        ))}
      </div>
    </section>
  )
}
