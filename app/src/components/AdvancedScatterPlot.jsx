/**
 * One scatter plot card for the Advanced pages. Simpler than ChartsPage's
 * full scatter — no dropdown picker, no chart-switching UI, just one chart
 * rendered from a config.
 *
 * Features kept from ChartsPage:
 *   - SVG rendering with headshots as dots
 *   - Hover tooltip
 *   - Dashed league-median crosshair (always visible)
 *   - Auto-scaling with 8% padding, extended to include medians
 *   - Click a headshot to open the player profile
 *   - Early-season banner when nobody clears the qualified pool
 *
 * Props:
 *   title        - string, chart title shown above
 *   description  - string, one-sentence "upper-right =" blurb
 *   players      - array of { id, name, qualified, x, y }
 *   leagueMedians - { x: number, y: number } — crosshair position
 *   xLabel, yLabel - axis labels
 *   xInvert, yInvert - flip the axis so "best" is always in the upper-right
 */

import { useMemo, useState } from 'react'

const W = 800, H = 500
const PAD = { top: 24, right: 30, bottom: 50, left: 60 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

export default function AdvancedScatterPlot({
  title, description,
  players, leagueMedians,
  xLabel, yLabel,
  xInvert = false, yInvert = false,
  xFormat = (v) => (v == null ? '—' : Number(v).toFixed(2)),
  yFormat = (v) => (v == null ? '—' : Number(v).toFixed(2)),
}) {
  const [hovered, setHovered] = useState(null)
  const [highlightHawks, setHighlightHawks] = useState(false)

  // Prefer qualified players for the main pool; fall back to all if nobody
  // qualifies (early season). Same pattern ChartsPage uses.
  const { points, isEarlySeason } = useMemo(() => {
    const withValues = players.filter(p => p.x != null && p.y != null)
    const qualified = withValues.filter(p => p.qualified)
    if (qualified.length > 0) return { points: qualified, isEarlySeason: false }
    return { points: withValues, isEarlySeason: true }
  }, [players])

  const scale = useMemo(() => {
    if (!points.length) return null
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const mx = leagueMedians?.x ?? null
    const my = leagueMedians?.y ?? null
    // Include medians in the domain so the dashed lines always render inside the plot
    const xMin = Math.min(...xs, mx ?? Infinity)
    const xMax = Math.max(...xs, mx ?? -Infinity)
    const yMin = Math.min(...ys, my ?? Infinity)
    const yMax = Math.max(...ys, my ?? -Infinity)
    const xPad = (xMax - xMin) * 0.08 || Math.abs(xMax) * 0.08 || 1
    const yPad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.08 || 1
    // Clamp the padded minimum to 0 when the data itself is all non-negative,
    // so stats like FGA / FG% don't show negative values on the axis.
    const xLo = xMin >= 0 ? Math.max(0, xMin - xPad) : xMin - xPad
    const yLo = yMin >= 0 ? Math.max(0, yMin - yPad) : yMin - yPad
    const xDomain = [xLo, xMax + xPad]
    const yDomain = [yLo, yMax + yPad]
    const xd = xInvert ? [xDomain[1], xDomain[0]] : xDomain
    const yd = yInvert ? [yDomain[1], yDomain[0]] : yDomain
    const toX = (v) => PAD.left + ((v - xd[0]) / (xd[1] - xd[0])) * PLOT_W
    const toY = (v) => PAD.top + PLOT_H - ((v - yd[0]) / (yd[1] - yd[0])) * PLOT_H
    return { xd, yd, toX, toY, mx, my }
  }, [points, leagueMedians, xInvert, yInvert])

  const ticks = useMemo(() => {
    if (!scale) return { x: [], y: [] }
    const n = 5
    const mk = (d) => Array.from({ length: n }, (_, i) => d[0] + ((d[1] - d[0]) * i) / (n - 1))
    return { x: mk(scale.xd), y: mk(scale.yd) }
  }, [scale])

  if (!scale || !points.length) {
    return (
      <section className="adv-scatter adv-scatter-empty">
        <header>
          <h3>{title}</h3>
          <p className="adv-scatter-desc">{description}</p>
        </header>
        <p className="adv-scatter-nodata">Not enough data yet.</p>
      </section>
    )
  }

  return (
    <section className="adv-scatter">
      <header className="adv-scatter-header">
        <div className="adv-scatter-title-row">
          <h3>{title}</h3>
          <button
            type="button"
            className={`adv-scatter-hawks-toggle ${highlightHawks ? 'active' : ''}`}
            onClick={() => setHighlightHawks(v => !v)}
            title={highlightHawks ? 'Show all players normally' : 'Highlight Hawks players'}
            aria-pressed={highlightHawks}
          >
            ATL
          </button>
        </div>
        <p className="adv-scatter-desc">{description}</p>
        {isEarlySeason && (
          <p className="adv-scatter-note">Early-season sample — showing all players.</p>
        )}
      </header>
      <div className="adv-scatter-canvas-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="adv-scatter-svg" onClick={() => setHovered(null)}>
          {/* Grid lines */}
          {ticks.x.map((v, i) => (
            <line key={`gx${i}`} x1={scale.toX(v)} x2={scale.toX(v)}
                  y1={PAD.top} y2={PAD.top + PLOT_H} className="adv-scatter-grid" />
          ))}
          {ticks.y.map((v, i) => (
            <line key={`gy${i}`} x1={PAD.left} x2={PAD.left + PLOT_W}
                  y1={scale.toY(v)} y2={scale.toY(v)} className="adv-scatter-grid" />
          ))}
          {/* League median crosshair */}
          {scale.mx != null && (
            <line x1={scale.toX(scale.mx)} x2={scale.toX(scale.mx)}
                  y1={PAD.top} y2={PAD.top + PLOT_H} className="adv-scatter-median" />
          )}
          {scale.my != null && (
            <line x1={PAD.left} x2={PAD.left + PLOT_W}
                  y1={scale.toY(scale.my)} y2={scale.toY(scale.my)} className="adv-scatter-median" />
          )}
          {/* Axis labels */}
          {ticks.x.map((v, i) => (
            <text key={`tx${i}`} x={scale.toX(v)} y={PAD.top + PLOT_H + 18}
                  className="adv-scatter-tick-label" textAnchor="middle">
              {xFormat(v)}
            </text>
          ))}
          {ticks.y.map((v, i) => (
            <text key={`ty${i}`} x={PAD.left - 8} y={scale.toY(v) + 4}
                  className="adv-scatter-tick-label" textAnchor="end">
              {yFormat(v)}
            </text>
          ))}
          <text x={PAD.left + PLOT_W / 2} y={H - 10}
                className="adv-scatter-axis-label" textAnchor="middle">{xLabel}</text>
          <text x={16} y={PAD.top + PLOT_H / 2}
                className="adv-scatter-axis-label" textAnchor="middle"
                transform={`rotate(-90 16 ${PAD.top + PLOT_H / 2})`}>{yLabel}</text>
          {/* Dots with headshots. When highlightHawks is on, non-Hawks fade to
              low opacity and Hawks get a red ring. Hawks are rendered LAST (via
              the sort below) so their rings sit on top. */}
          {points
            .slice()
            .sort((a, b) => {
              if (!highlightHawks) return 0
              const ah = a.team === 'ATL' ? 1 : 0
              const bh = b.team === 'ATL' ? 1 : 0
              return ah - bh // Hawks last → painted on top
            })
            .map((p) => {
            const cx = scale.toX(p.x), cy = scale.toY(p.y)
            const isHawk = p.team === 'ATL'
            const groupOpacity = highlightHawks && !isHawk ? 0.25 : 1
            const ringClass = `adv-scatter-dot-ring${p.qualified ? '' : ' faded'}${highlightHawks && isHawk ? ' hawks-highlight' : ''}`
            return (
              <g key={p.id}
                 opacity={groupOpacity}
                 style={{ cursor: 'pointer' }}
                 onMouseEnter={() => setHovered(p)}
                 onMouseLeave={() => setHovered(null)}
                 onClick={(e) => {
                   // Toggle the tooltip for this player. On desktop this is
                   // redundant with hover (mouseLeave clears it when the
                   // mouse moves off); on mobile where hover doesn't exist,
                   // tap pins/unpins the tooltip. Stop propagation so the
                   // SVG background's onClick (which clears) doesn't fire.
                   e.stopPropagation()
                   setHovered((h) => (h?.id === p.id ? null : p))
                 }}>
                <defs>
                  <clipPath id={`clip-${title.replace(/\W+/g, '')}-${p.id}`}>
                    <circle cx={cx} cy={cy} r="14" />
                  </clipPath>
                </defs>
                <image
                  x={cx - 14} y={cy - 14} width="28" height="28"
                  href={`/nba-headshots/${p.id}.png`}
                  clipPath={`url(#clip-${title.replace(/\W+/g, '')}-${p.id})`}
                />
                <circle cx={cx} cy={cy} r="14" fill="none"
                        className={ringClass} />
              </g>
            )
          })}
        </svg>
        {hovered && (
          <div className="adv-scatter-tooltip" style={{
            left: `${(scale.toX(hovered.x) / W) * 100}%`,
            top: `${(scale.toY(hovered.y) / H) * 100}%`,
          }}>
            <div className="adv-scatter-tooltip-name">{hovered.name}</div>
            <div className="adv-scatter-tooltip-vals">
              {yLabel}: {yFormat(hovered.y)} · {xLabel}: {xFormat(hovered.x)}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
