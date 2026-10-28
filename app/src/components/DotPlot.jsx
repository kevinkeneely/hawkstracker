import { useEffect, useRef, useState } from 'react'

// Dot sizes are fixed in actual pixels regardless of plot width. The
// SVG uses a 1:1 viewBox that matches the measured container width, so
// 1 user unit = 1 pixel and all radii stay the size we declare.
const HEIGHT = 40
const BASELINE_Y = 20
const MARGIN_X = 15
const DOT_R = 4
const HAWKS_R = 13

export default function DotPlot({ values, hawksId, hawksRank, format }) {
  const [hovered, setHovered] = useState(null)
  const containerRef = useRef(null)
  // Start at 0 so we don't render dots at the wrong width before measurement.
  const [width, setWidth] = useState(0)

  // Measure the container width (keeps in sync as the layout changes).
  // Uses getBoundingClientRect for fractional-pixel accuracy and defers the
  // first read to the next frame so the CSS layout has settled.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(w)
    }
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  if (!values || values.length === 0) return null
  // Before the first measurement, render a placeholder of the correct height
  // so the layout doesn't jump when the measured width comes in.
  if (width === 0) {
    return <div className="dot-plot" ref={containerRef} style={{ height: `${HEIGHT}px` }} />
  }

  const nums = values.map((v) => v.value)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1 // avoid divide-by-zero

  // Pixel-space x coordinate for a stat value. Uses the measured width,
  // so dots spread across whatever width the container gives us.
  const xFor = (value) => {
    const t = (value - min) / range
    return MARGIN_X + t * (width - 2 * MARGIN_X)
  }

  const fmt = format || ((v) => v.toFixed(2))
  const hawks = values.find((v) => v.id === hawksId)

  return (
    <div className="dot-plot" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Distribution across 30 teams"
        style={{ width: '100%', height: `${HEIGHT}px`, display: 'block' }}
      >
        {/* Baseline */}
        <line
          x1={MARGIN_X}
          y1={BASELINE_Y}
          x2={width - MARGIN_X}
          y2={BASELINE_Y}
          className="dot-plot-baseline"
        />

        {/* Other teams */}
        {values.map((team) =>
          team.id === hawksId ? null : (
            <circle
              key={team.id}
              cx={xFor(team.value)}
              cy={BASELINE_Y}
              r={DOT_R}
              className="dot-plot-dot"
              onMouseEnter={() =>
                setHovered({ name: team.name, value: team.value, x: xFor(team.value) })
              }
              onMouseLeave={() => setHovered(null)}
            />
          )
        )}

        {/* Hawks — rendered last so it sits on top */}
        {hawks && (
          <g>
            <circle
              cx={xFor(hawks.value)}
              cy={BASELINE_Y}
              r={HAWKS_R}
              className="dot-plot-hawks"
              onMouseEnter={() =>
                setHovered({ name: hawks.name, value: hawks.value, x: xFor(hawks.value) })
              }
              onMouseLeave={() => setHovered(null)}
            />
            <text
              x={xFor(hawks.value)}
              y={BASELINE_Y + 1}
              className="dot-plot-hawks-rank"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {hawksRank ?? ''}
            </text>
          </g>
        )}
      </svg>

      {hovered && (
        <div className="dot-plot-tooltip" style={{ left: `${(hovered.x / width) * 100}%` }}>
          {hovered.name}: {fmt(hovered.value)}
        </div>
      )}
    </div>
  )
}
