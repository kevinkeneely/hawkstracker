import { useState } from 'react'

// Dimensions tuned for the "small plot in a row" use case.
const WIDTH = 260
const HEIGHT = 40
const BASELINE_Y = 20
const MARGIN_X = 10

export default function DotPlot({ values, hawksId, hawksRank, format }) {
  const [hovered, setHovered] = useState(null)

  if (!values || values.length === 0) return null

  const nums = values.map((v) => v.value)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1 // avoid divide-by-zero when all values are equal

  // Convert a stat value to an x coordinate inside the SVG.
  const xFor = (value) => {
    const t = (value - min) / range
    return MARGIN_X + t * (WIDTH - 2 * MARGIN_X)
  }

  const fmt = format || ((v) => v.toFixed(2))
  const hawks = values.find((v) => v.id === hawksId)

  return (
    <div className="dot-plot">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Distribution across 30 teams"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {/* Baseline */}
        <line
          x1={MARGIN_X}
          y1={BASELINE_Y}
          x2={WIDTH - MARGIN_X}
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
              r={3}
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
              r={10}
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
        <div className="dot-plot-tooltip" style={{ left: `${(hovered.x / WIDTH) * 100}%` }}>
          {hovered.name}: {fmt(hovered.value)}
        </div>
      )}
    </div>
  )
}
