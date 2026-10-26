import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Each chart config:
//   xField/yField: key on the player object (hawksData.json)
//   xScale/yScale: 'decimal' (0-1, shown ×100) or 'percent' (already a percent number)
//                  or 'raw' (shown as-is, no %)
//   invertX / invertY: true if LOWER is BETTER (e.g. DRtg, TOV%) — flips so top-right
//                      is always the "best" quadrant
const CHARTS = [
  {
    key: 'rim-3p',
    label: 'Shot Profile — Rim% × 3P%',
    desc: 'FG% at the rim vs FG% from three. Top-right = efficient at both.',
    xField: 'fg3_pct', xLabel: '3P%',     xScale: 'decimal', xMin: 0, xMax: 1,
    yField: 'rim_pct', yLabel: 'Rim FG%', yScale: 'decimal', yMin: 0, yMax: 1,
  },
  {
    key: 'ppg-ts',
    label: 'Scoring — PPG × TS%',
    desc: 'Volume (points per game) vs efficiency (TS%). Top-right = heavy, efficient scorer.',
    xField: 'ppg',    xLabel: 'PPG', xScale: 'raw',     xMin: 0,
    yField: 'ts_pct', yLabel: 'TS%', yScale: 'decimal', yMin: 0, yMax: 1,
  },
  {
    key: 'ast-tov',
    label: 'Playmaking — AST% × TOV%',
    desc: '% of teammate FGs assisted vs team turnover rate. Top-right = clean creator (low TOV, high AST).',
    xField: 'tov_pct', xLabel: 'TOV%', xScale: 'decimal', invertX: true, xMin: 0,
    yField: 'ast_pct', yLabel: 'AST%', yScale: 'decimal',                yMin: 0,
  },
  {
    key: 'stl-blk',
    label: 'Defense — STL% × BLK%',
    desc: 'Opponent possessions ended with a steal vs opp 2-pt attempts blocked. Top-right = disruptive defender.',
    xField: 'stl_pct', xLabel: 'STL%', xScale: 'decimal', xMin: 0,
    yField: 'blk_pct', yLabel: 'BLK%', yScale: 'decimal', yMin: 0,
  },
]

// Players under this total MP (mpg * gp) are hidden entirely.
// Matches the pipeline's MIN_PLAYED_THRESHOLD so the chart's pool lines up
// with the percentile pool used for stl_pct / blk_pct.
const MIN_TOTAL_MP = 200

// SVG canvas (viewBox units). Scales to any container width.
const W = 800, H = 500
const PAD = { top: 24, right: 32, bottom: 56, left: 64 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const DOT_SIZE = 32    // normal headshot diameter in viewBox units
const DOT_HOVER = 44   // enlarged on hover

function fmt(value, scale) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (scale === 'decimal') {
    // Preserve precision for small stats like stl_pct (0.0285 → "2.85%")
    // while keeping larger stats like fg_pct terse (0.489 → "48.9%").
    const dp = Math.abs(value) < 0.1 ? 2 : 1
    return (value * 100).toFixed(dp) + '%'
  }
  if (scale === 'percent') return value.toFixed(2) + '%'
  return value.toFixed(1)
}

function median(arr) {
  const vals = arr.filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b)
  if (!vals.length) return null
  const mid = Math.floor(vals.length / 2)
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

export default function ChartsPage({ playerData, leaderboards }) {
  const [chartKey, setChartKey] = useState(CHARTS[0].key)
  const [hoveredId, setHoveredId] = useState(null)
  const navigate = useNavigate()

  // Detect touch-primary devices (phones, tablets, iPhone emulation in DevTools).
  // On these, we use a two-tap pattern: first tap on a dot sets the tooltip,
  // second tap on the same dot navigates. Desktop with a mouse keeps single-click
  // navigation and hover-driven tooltips. The matchMedia check is more reliable
  // across browsers than per-event pointerType.
  const isTouch =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(hover: none)').matches

  const chart = CHARTS.find(c => c.key === chartKey) || CHARTS[0]
  const players = playerData?.players || []

  // Build a quick rim_pct lookup from the league leaderboards file,
  // which carries shot-zone splits that hawksData.json does not.
  const rimById = useMemo(() => {
    const map = {}
    for (const p of (leaderboards?.players || [])) {
      if (p?.zones?.at_rim?.pct != null) map[p.id] = p.zones.at_rim.pct
    }
    return map
  }, [leaderboards])

  // Enrich each Hawks player with the fields that live outside hawksData.json
  // before reading chart axis values.
  const enriched = useMemo(() => (
    players.map(p => ({ ...p, rim_pct: rimById[p.id] ?? p?.zones?.at_rim?.pct ?? null }))
  ), [players, rimById])

  // League medians. Most come from hawksData.json's league_medians block
  // (written by the pipeline). rim_pct lives in the leaderboards file, so
  // compute it here from that file's player pool.
  const leagueMedians = useMemo(() => {
    const base = playerData?.league_medians ?? {}
    const rimVals = (leaderboards?.players || [])
      .map(p => p?.zones?.at_rim?.pct)
      .filter(v => v != null && Number.isFinite(v))
      .sort((a, b) => a - b)
    const rimMedian = rimVals.length
      ? (rimVals.length % 2
          ? rimVals[Math.floor(rimVals.length / 2)]
          : (rimVals[rimVals.length / 2 - 1] + rimVals[rimVals.length / 2]) / 2)
      : null
    return { ...base, rim_pct: rimMedian }
  }, [playerData, leaderboards])

  // Only players with both axis values populated. We first try to apply the
  // 200-min threshold (matches the pipeline's percentile pool). If NOBODY
  // qualifies — early in the season nobody will — fall back to the full
  // (unfiltered) set and flag it so the UI can show an early-season banner.
  const { points, isEarlySeason } = useMemo(() => {
    const withValues = enriched
      .filter(p => p[chart.xField] != null && p[chart.yField] != null)
      .map(p => ({
        id: p.id,
        name: p.name,
        mpg: p.mpg ?? 0,
        gp: p.gp ?? 0,
        x: p[chart.xField],
        y: p[chart.yField],
      }))
    const qualified = withValues.filter(p => p.mpg * p.gp >= MIN_TOTAL_MP)
    if (qualified.length > 0) return { points: qualified, isEarlySeason: false }
    return { points: withValues, isEarlySeason: true }
  }, [enriched, chart])

  // Axis extents with 8% padding so dots don't hug the frame.
  const scale = useMemo(() => {
    if (!points.length) return null
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xPad = (xMax - xMin) * 0.08 || Math.abs(xMax) * 0.08 || 1
    const yPad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.08 || 1
    // Clamp padded domain to the chart config's natural bounds when provided
    // (e.g. percentages can't go below 0 or above 1).
    const clamp = (v, lo, hi) => {
      let out = v
      if (lo != null) out = Math.max(out, lo)
      if (hi != null) out = Math.min(out, hi)
      return out
    }
    const xDomain = [
      clamp(xMin - xPad, chart.xMin, chart.xMax),
      clamp(xMax + xPad, chart.xMin, chart.xMax),
    ]
    const yDomain = [
      clamp(yMin - yPad, chart.yMin, chart.yMax),
      clamp(yMax + yPad, chart.yMin, chart.yMax),
    ]
    // invertX / invertY: flip domain so top-right is always "best"
    const xd = chart.invertX ? [xDomain[1], xDomain[0]] : xDomain
    const yd = chart.invertY ? [yDomain[1], yDomain[0]] : yDomain
    const toX = (v) => PAD.left + ((v - xd[0]) / (xd[1] - xd[0])) * PLOT_W
    const toY = (v) => PAD.top + PLOT_H - ((v - yd[0]) / (yd[1] - yd[0])) * PLOT_H
    // League medians for the crosshair, with Hawks-median fallback for the
    // rare case where the league value is missing (e.g. before the pipeline
    // has been re-run since this feature shipped).
    const mx = leagueMedians[chart.xField] ?? median(xs)
    const my = leagueMedians[chart.yField] ?? median(ys)
    return { xd, yd, toX, toY, mx, my }
  }, [points, chart, leagueMedians])

  // Axis tick values (5 evenly spaced across the domain).
  // Use scale.xd/yd directly — scale.toX/toY already handle inversion,
  // so a tick value placed via scale.toX ends up where that value's dot would.
  const ticks = useMemo(() => {
    if (!scale) return { x: [], y: [] }
    const n = 5
    const mk = (d) => Array.from({ length: n }, (_, i) => d[0] + ((d[1] - d[0]) * i) / (n - 1))
    return { x: mk(scale.xd), y: mk(scale.yd) }
  }, [scale])

  const hovered = points.find(p => p.id === hoveredId) || null

  if (!players.length) {
    return (
      <div className="charts-empty">
        <p>No player data loaded.</p>
      </div>
    )
  }

  return (
    <div className="charts-page">
      <header className="charts-header">
        <div className="charts-picker">
          <label htmlFor="chart-select" className="charts-picker-label">Chart</label>
          <select
            id="chart-select"
            className="charts-select"
            value={chartKey}
            onChange={(e) => { setChartKey(e.target.value); setHoveredId(null) }}
          >
            {CHARTS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <p className="charts-desc">{chart.desc}</p>
        <p className="charts-note">
          Dashed lines = league median.{' '}
          {isEarlySeason
            ? `Early-season sample — showing all players; filter relaxes once anyone reaches ${MIN_TOTAL_MP}+ total minutes.`
            : `Showing players with ${MIN_TOTAL_MP}+ total minutes.`}
          {' '}Click a player to open their profile.
        </p>
      </header>

      <div className="charts-canvas-wrap">
        <svg
          className="charts-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${chart.label} scatter plot`}
        >
          {/* Plot frame — clicking the background dismisses the tooltip on touch
              devices so users can poke multiple players without being forced into
              a profile. */}
          <rect
            x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H}
            className="charts-plot-bg"
            onClick={() => { if (isTouch) setHoveredId(null) }}
          />

          {/* Gridlines */}
          {scale && ticks.y.map((t, i) => (
            <line
              key={`gy-${i}`}
              x1={PAD.left} x2={PAD.left + PLOT_W}
              y1={scale.toY(t)}
              y2={scale.toY(t)}
              className="charts-grid"
            />
          ))}
          {scale && ticks.x.map((t, i) => (
            <line
              key={`gx-${i}`}
              x1={scale.toX(t)}
              x2={scale.toX(t)}
              y1={PAD.top} y2={PAD.top + PLOT_H}
              className="charts-grid"
            />
          ))}

          {/* Median crosshair (dashed) */}
          {scale && scale.mx != null && (
            <line
              x1={scale.toX(scale.mx)} x2={scale.toX(scale.mx)}
              y1={PAD.top} y2={PAD.top + PLOT_H}
              className="charts-median"
            />
          )}
          {scale && scale.my != null && (
            <line
              x1={PAD.left} x2={PAD.left + PLOT_W}
              y1={scale.toY(scale.my)} y2={scale.toY(scale.my)}
              className="charts-median"
            />
          )}

          {/* Axis tick labels */}
          {scale && ticks.x.map((t, i) => (
            <text
              key={`tx-${i}`}
              x={scale.toX(t)}
              y={PAD.top + PLOT_H + 18}
              className="charts-tick"
              textAnchor="middle"
            >
              {fmt(t, chart.xScale)}
            </text>
          ))}
          {scale && ticks.y.map((t, i) => (
            <text
              key={`ty-${i}`}
              x={PAD.left - 10}
              y={scale.toY(t) + 4}
              className="charts-tick"
              textAnchor="end"
            >
              {fmt(t, chart.yScale)}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={PAD.left + PLOT_W / 2}
            y={H - 10}
            className="charts-axis-label"
            textAnchor="middle"
          >
            {chart.xLabel}{chart.invertX ? ' (lower is better)' : ''}
          </text>
          <text
            transform={`rotate(-90) translate(${-(PAD.top + PLOT_H / 2)}, 18)`}
            className="charts-axis-label"
            textAnchor="middle"
          >
            {chart.yLabel}{chart.invertY ? ' (lower is better)' : ''}
          </text>

          {/* Dots: headshots, dimmed when under-qualified. Hovered rendered last so it's on top. */}
          <defs>
            {points.map(p => (
              <clipPath key={`clip-${p.id}`} id={`clip-${p.id}`}>
                <circle cx={0} cy={0} r={DOT_HOVER / 2} />
              </clipPath>
            ))}
          </defs>

          {scale && [...points.filter(p => p.id !== hoveredId), ...points.filter(p => p.id === hoveredId)].map(p => {
            const cx = scale.toX(p.x), cy = scale.toY(p.y)
            const isHover = p.id === hoveredId
            const size = isHover ? DOT_HOVER : DOT_SIZE
            return (
              <g
                key={p.id}
                transform={`translate(${cx}, ${cy})`}
                className={`charts-dot ${isHover ? 'is-hover' : ''}`}
                onMouseEnter={() => { if (!isTouch) setHoveredId(p.id) }}
                onMouseLeave={() => { if (!isTouch) setHoveredId(null) }}
                onClick={() => {
                  // Touch devices: first tap on a dot shows the tooltip, second
                  // tap on the SAME dot navigates. Mouse devices: single-click
                  // navigates straight through.
                  if (isTouch && hoveredId !== p.id) {
                    setHoveredId(p.id)
                  } else {
                    navigate(`/players/${p.id}`)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <image
                  href={`https://cdn.nba.com/headshots/nba/latest/1040x760/${p.id}.png`}
                  x={-size / 2}
                  y={-size / 2}
                  width={size}
                  height={size * 0.73}  /* 1040:760 aspect, keep face centered */
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#clip-${p.id})`}
                />
                <circle cx={0} cy={0} r={size / 2} className="charts-dot-ring" fill="none" />
              </g>
            )
          })}

          {/* Hover tooltip (SVG so it moves with the SVG scaling) */}
          {hovered && scale && (() => {
            const cx = scale.toX(hovered.x), cy = scale.toY(hovered.y)
            // Flip tooltip to the left/below if near edges.
            const flipRight = cx > PAD.left + PLOT_W * 0.65
            const flipDown  = cy < PAD.top + PLOT_H * 0.2
            const tx = flipRight ? cx - 180 : cx + 32
            const ty = flipDown  ? cy + 24  : cy - 60
            return (
              <g className="charts-tip" transform={`translate(${tx}, ${ty})`}>
                <rect x={0} y={0} width={170} height={56} rx={6} className="charts-tip-bg" />
                <text x={10} y={20} className="charts-tip-name">{hovered.name}</text>
                <text x={10} y={38} className="charts-tip-val">
                  {chart.xLabel}: {fmt(hovered.x, chart.xScale)}
                </text>
                <text x={10} y={52} className="charts-tip-val">
                  {chart.yLabel}: {fmt(hovered.y, chart.yScale)}
                </text>
              </g>
            )
          })()}
        </svg>
      </div>
    </div>
  )
}
