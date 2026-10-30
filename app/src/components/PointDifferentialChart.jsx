import { useEffect, useState } from 'react'

// Cumulative point differential across the season.
//
// Reads schedule-{season}.json (same source ScheduleStrip and BoxScorePage
// use), keeps only Final games with scores, sorts by date, and plots a
// running sum of (hawks_score - opp_score) with game number on the x-axis.
//
// SVG style matches ChartsPage.jsx: fixed viewBox that scales to any width,
// explicit paddings, CSS vars for colors so light/dark theme both work.
//
// Phase 4 (Oct 27, 2026): cumulative-only, game-number x-axis. The reference
// image has toggles for per-game vs cumulative and date vs game-number — those
// are a Phase 7 polish pass once the base chart is validated.

const W = 800
const H = 420
const PAD = { top: 24, right: 32, bottom: 48, left: 56 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// Round a positive number up to the next "nice" axis bound (10, 20, 50, 100…).
function niceCeil(v) {
  if (v <= 10) return 10
  if (v <= 20) return 20
  if (v <= 50) return 50
  if (v <= 100) return 100
  if (v <= 200) return 200
  return Math.ceil(v / 100) * 100
}

// Pick a tick step so we end up with roughly 6-10 labels across the games
// axis. For small samples (3 games) show every game; for full seasons (82
// games) show every ~10th.
function pickXStep(n) {
  if (n <= 10) return 1
  if (n <= 20) return 2
  if (n <= 50) return 5
  return 10
}

export default function PointDifferentialChart({ season }) {
  const [schedule, setSchedule] = useState(null)
  const [error, setError] = useState(null)
  // Which dot's tooltip is open. Driven by mouseenter/mouseleave on the
  // invisible hit circles; mobile browsers synthesize mouseenter from a tap,
  // so the tooltip opens on tap too (unlike the native <title> which doesn't).
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    setSchedule(null)
    setError(null)
    fetch(`/schedule-${season}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load schedule-${season}.json (${r.status})`)
        return r.json()
      })
      .then((d) => setSchedule(d))
      .catch((e) => setError(e.message))
  }, [season])

  if (error) {
    return <div className="pdiff-chart-error">Point differential unavailable: {error}</div>
  }
  if (!schedule) {
    return <div className="pdiff-chart-loading">Loading…</div>
  }

  // Keep only final games with real scores, ordered by date.
  //
  // NBA game_id position 2 encodes the game type:
  //   '1' = preseason  (excluded — doesn't count toward the season)
  //   '2' = regular season
  //   '3' = All-Star
  //   '4' = playoffs
  //   '5' = play-in
  //   '6' = NBA Cup (counts toward regular season except semifinal/final in Vegas)
  // Anything that counts toward the Hawks' season narrative is kept.
  const EXCLUDED_TYPES = new Set(['1', '3'])
  const completed = (schedule.games ?? [])
    .filter(
      (g) =>
        g.status === 'Final' &&
        typeof g.hawks_score === 'number' &&
        typeof g.opp_score === 'number' &&
        typeof g.game_id === 'string' &&
        !EXCLUDED_TYPES.has(g.game_id[2])
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  if (completed.length === 0) {
    return (
      <div className="pdiff-chart-empty" style={{ padding: '1rem 0', opacity: 0.7 }}>
        <h3 style={{ margin: '0 0 0.25rem 0' }}>Cumulative point differential</h3>
        <p style={{ margin: 0 }}>No completed games yet this season.</p>
      </div>
    )
  }

  // Compute cumulative differential at each game, keeping the single-game
  // margin alongside so the tooltip can show both.
  let running = 0
  const points = completed.map((g, i) => {
    const gameDiff = g.hawks_score - g.opp_score
    running += gameDiff
    return {
      gameNum: i + 1,
      cumDiff: running,
      gameDiff,
      date: g.date,
      opp: g.opp_tricode,
      hawksScore: g.hawks_score,
      oppScore: g.opp_score,
    }
  })

  // Axis bounds. Symmetric around zero so wins and losses read on the same scale.
  const nGames = points.length
  const maxAbs = Math.max(10, ...points.map((p) => Math.abs(p.cumDiff)))
  const yBound = niceCeil(maxAbs)
  const yMin = -yBound
  const yMax = yBound
  // X is simply game 1..n. We force at least 2 so a single-game chart doesn't divide by zero.
  const xMin = 1
  const xMax = Math.max(2, nGames)

  const xScale = (gameNum) => PAD.left + ((gameNum - xMin) / (xMax - xMin)) * PLOT_W
  const yScale = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H
  const y0 = yScale(0)

  // Build the connecting line.
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.gameNum).toFixed(1)} ${yScale(p.cumDiff).toFixed(1)}`)
    .join(' ')

  // Build a closed area polygon = line + down to zero on the right + back
  // along the zero line to the left. We render this polygon twice, once
  // clipped to above-zero (green fill) and once clipped to below-zero
  // (light Hawks-red fill), so zigzags across zero split color automatically.
  const firstX = xScale(points[0].gameNum)
  const lastX = xScale(points[points.length - 1].gameNum)
  const areaPath = `${linePath} L ${lastX.toFixed(1)} ${y0.toFixed(1)} L ${firstX.toFixed(1)} ${y0.toFixed(1)} Z`

  // Y-axis ticks: 5 lines, nice round numbers at yBound / 2 steps.
  const yStep = yBound / 2
  const yTicks = []
  for (let v = -yBound; v <= yBound; v += yStep) {
    yTicks.push(v)
  }

  // X-axis ticks: adaptive spacing based on game count.
  const xStep = pickXStep(nGames)
  const xTicks = []
  for (let g = 1; g <= nGames; g += xStep) xTicks.push(g)
  if (xTicks[xTicks.length - 1] !== nGames) xTicks.push(nGames)

  // Final cumulative value for the summary line above the chart.
  const final = points[points.length - 1].cumDiff
  const signed = (final >= 0 ? '+' : '') + final

  return (
    <div className="pdiff-chart" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Cumulative point differential</h3>
        <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>
          Through game {nGames}: <strong style={{ color: final >= 0 ? 'var(--good, #4caf50)' : 'var(--bad, #c8102e)' }}>{signed}</strong>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Hawks cumulative point differential through ${nGames} games`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onClick={() => setHovered(null)}
      >
        {/* Clip paths used by the two area fills: above-zero (green) and
            below-zero (light Hawks red). */}
        <defs>
          <clipPath id="pdiff-above-zero">
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={Math.max(0, y0 - PAD.top)} />
          </clipPath>
          <clipPath id="pdiff-below-zero">
            <rect x={PAD.left} y={y0} width={PLOT_W} height={Math.max(0, PAD.top + PLOT_H - y0)} />
          </clipPath>
        </defs>

        {/* Area fills — same polygon, two colors clipped to each half. */}
        <path d={areaPath} fill="rgba(76, 175, 80, 0.18)" clipPath="url(#pdiff-above-zero)" />
        <path d={areaPath} fill="rgba(200, 16, 46, 0.18)" clipPath="url(#pdiff-below-zero)" />

        {/* Y-axis grid + labels */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="var(--border)"
              strokeOpacity={v === 0 ? 0.9 : 0.25}
              strokeDasharray={v === 0 ? '0' : '2 3'}
            />
            <text
              x={PAD.left - 8}
              y={yScale(v)}
              fill="var(--text)"
              fillOpacity={0.6}
              fontSize="12"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        {/* X-axis tick labels */}
        {xTicks.map((g) => (
          <text
            key={`x-${g}`}
            x={xScale(g)}
            y={PAD.top + PLOT_H + 18}
            fill="var(--text)"
            fillOpacity={0.6}
            fontSize="12"
            textAnchor="middle"
          >
            {g}
          </text>
        ))}

        {/* Axis titles */}
        <text
          x={PAD.left + PLOT_W / 2}
          y={H - 8}
          fill="var(--text)"
          fillOpacity={0.8}
          fontSize="13"
          textAnchor="middle"
          fontWeight="600"
        >
          Game
        </text>
        <text
          x={16}
          y={PAD.top + PLOT_H / 2}
          fill="var(--text)"
          fillOpacity={0.8}
          fontSize="13"
          textAnchor="middle"
          fontWeight="600"
          transform={`rotate(-90 16 ${PAD.top + PLOT_H / 2})`}
        >
          Cumulative point differential
        </text>

        {/* The line itself */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--hawks-red, #c8102e)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* A dot at each game, plus a larger invisible hit-area circle on top.
            onMouseEnter/Leave drives a positioned <div> tooltip below — this
            works on tap on mobile (which the native <title> does not). */}
        {points.map((p) => (
          <g key={p.gameNum}>
            <circle
              cx={xScale(p.gameNum)}
              cy={yScale(p.cumDiff)}
              r={3}
              fill="var(--hawks-red, #c8102e)"
              stroke="var(--bg, #111216)"
              strokeWidth="1"
              pointerEvents="none"
            />
            <circle
              cx={xScale(p.gameNum)}
              cy={yScale(p.cumDiff)}
              r={12}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => { e.stopPropagation(); setHovered(p) }}
            />
          </g>
        ))}
      </svg>

      {hovered && (() => {
        // Center the tooltip on the dot for middle games, but anchor to the
        // left or right edge for dots within 15% of either side so the
        // tooltip stays fully within the chart container. The CSS transform
        // (-50%) is overridden inline here so the vertical offset stays.
        const leftPct = (xScale(hovered.gameNum) / W) * 100
        const topPct  = (yScale(hovered.cumDiff) / H) * 100
        // Horizontal anchor: left-edge dots push tooltip right, right-edge
        // push left, middle stays centered.
        let translateX = '-50%'
        if (leftPct < 15) translateX = '0%'
        else if (leftPct > 85) translateX = '-100%'
        // Vertical anchor: top-edge dots flip the tooltip below the dot so
        // it doesn't get clipped by the top of the chart. Bottom-edge dots
        // keep the default (above the dot) since the chart has room below.
        const translateY = topPct < 20 ? '10px' : 'calc(-100% - 10px)'
        return (
        <div
          className="pdiff-tooltip"
          style={{
            left: `${leftPct}%`,
            top: `${topPct}%`,
            transform: `translate(${translateX}, ${translateY})`,
          }}
        >
          <div className="pdiff-tooltip-line pdiff-tooltip-head">
            Game {hovered.gameNum} vs {hovered.opp}
          </div>
          <div className="pdiff-tooltip-line">
            {hovered.gameDiff >= 0 ? 'W' : 'L'} {hovered.hawksScore}-{hovered.oppScore}
            {' '}({hovered.gameDiff >= 0 ? '+' : ''}{hovered.gameDiff})
          </div>
          <div className="pdiff-tooltip-line pdiff-tooltip-cum">
            Cumulative: {hovered.cumDiff >= 0 ? '+' : ''}{hovered.cumDiff}
          </div>
        </div>
        )
      })()}
    </div>
  )
}
