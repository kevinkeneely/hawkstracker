import { useEffect, useState } from 'react'

// NBA shot coordinate system:
//   x: -250 (left) to +250 (right), 1 unit = 0.1 ft
//   y: -47.5 (behind backboard) to 422.5 (half court)
//   hoop center at (0, 0)

const HEX_SIZE = 22          // MUST match pipeline/transform_league_baseline.py
const MIN_SHOTS_PER_HEX = 3  // hide hexes with fewer shots (Q4 Option B)

// ──────────────── Diverging color: blue (below avg) → gray (avg) → red (above) ────────────────
const COLOR_LOW = { r: 63, g: 81, b: 181 }    // #3F51B5
const COLOR_MID = { r: 138, g: 130, b: 144 }  // #8A8290
const COLOR_HIGH = { r: 200, g: 16, b: 46 }   // #C8102E — Hawks red
const COLOR_RANGE = 0.15  // FG% diff clamped to ±15pp for color scaling

const lerp = (a, b, t) => Math.round(a + (b - a) * t)

function colorForDiff(diff) {
  const t = Math.max(-1, Math.min(1, diff / COLOR_RANGE))
  const anchor = t < 0 ? COLOR_LOW : COLOR_HIGH
  const amount = Math.abs(t)
  const r = lerp(COLOR_MID.r, anchor.r, amount)
  const g = lerp(COLOR_MID.g, anchor.g, amount)
  const b = lerp(COLOR_MID.b, anchor.b, amount)
  return `rgb(${r}, ${g}, ${b})`
}

// ──────────────── Hex binning (JS mirror of transform_league_baseline.py) ────────────────
function pixelToHex(x, y, size) {
  const qf = (2 / 3 * x) / size
  const rf = (-1 / 3 * x + Math.sqrt(3) / 3 * y) / size
  return cubeRound(qf, rf)
}

function cubeRound(qf, rf) {
  const x = qf, z = rf, y = -x - z
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z)
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z)
  if (dx > dy && dx > dz)      rx = -ry - rz
  else if (dy > dz)            ry = -rx - rz
  else                         rz = -rx - ry
  return [rx, rz]
}

function hexToPixel(q, r, size) {
  const x = size * (3 / 2 * q)
  const y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  return [x, y]
}

function hexPolygonPoints(cx, cy, size) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i)  // flat-top: 0°, 60°, …, 300°
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`)
  }
  return pts.join(' ')
}

// ──────────────── Court lines ────────────────
function CourtLines() {
  return (
     <g fill="none" stroke="var(--text)" strokeWidth={1.5}>
      {/* Baseline + sidelines (full half-court) */}
      <rect x={-250} y={-47.5} width={500} height={470} />
      {/* Paint (free throw lane) — 16 ft wide, baseline to FT line */}
      <rect x={-80} y={-47.5} width={160} height={190} />
      {/* Free throw circle */}
      <circle cx={0} cy={142.5} r={60} />
      {/* Restricted area (4 ft arc under rim) */}
      <path d="M -40 0 A 40 40 0 0 0 40 0" />
      {/* Backboard */}
      <line x1={-30} y1={-7.5} x2={30} y2={-7.5} strokeWidth={2.5} />
      {/* Rim */}
      <circle cx={0} cy={0} r={7.5} />
      {/* Three-point line: corners + arc */}
      <line x1={-220} y1={-47.5} x2={-220} y2={92.5} />
      <line x1={220} y1={-47.5} x2={220} y2={92.5} />
      <path d="M -220 92.5 A 237.5 237.5 0 0 0 220 92.5" />
    </g>
  )
}

// ──────────────── Legend ────────────────
function Legend() {
  return (
    <div className="shot-chart-legend">
      <div className="legend-row">
        <span className="legend-label">FG% vs league:</span>
        <div className="legend-gradient" />
      </div>
      <div className="legend-row">
        <span className="legend-label">Hex size:</span>
        <span className="legend-size-dot small" />
        <span className="legend-size-dot med" />
        <span className="legend-size-dot large" />
        <span className="legend-tick">shots taken</span>
      </div>
    </div>
  )
}

// ──────────────── Main component ────────────────
export default function ShotChart({ playerId, leagueBaseline }) {
  const [shots, setShots] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setShots(null)
    setError(null)
    fetch(`/shots/${playerId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('no shot data')
        return r.json()
      })
      .then(setShots)
      .catch((e) => setError(e.message))
  }, [playerId])

  if (error) return <div className="shot-chart-empty">No shot data available.</div>
  if (!shots) return <div className="shot-chart-empty">Loading shot chart…</div>
  if (!leagueBaseline) return <div className="shot-chart-empty">Loading league baseline…</div>

  // League baseline lookup: "q,r" → fg_pct
  const leagueByHex = {}
  for (const h of leagueBaseline.hexes) {
    leagueByHex[`${h.q},${h.r}`] = h.fg_pct
  }

  // Bucket this player's shots into hex cells
  const cellMap = new Map()
  for (const s of shots) {
    const [q, r] = pixelToHex(s.x, s.y, HEX_SIZE)
    const key = `${q},${r}`
    const cell = cellMap.get(key) || { q, r, shots: 0, makes: 0 }
    cell.shots += 1
    cell.makes += s.made
    cellMap.set(key, cell)
  }

  // Filter + enrich with FG% diff vs league
  const cells = []
  let maxShots = 1
  for (const cell of cellMap.values()) {
    if (cell.shots < MIN_SHOTS_PER_HEX) continue
    const leagueFg = leagueByHex[`${cell.q},${cell.r}`]
    if (leagueFg == null) continue
    cell.fg_pct = cell.makes / cell.shots
    cell.diff = cell.fg_pct - leagueFg
    cells.push(cell)
    if (cell.shots > maxShots) maxShots = cell.shots
  }

  return (
    <div className="shot-chart">
      <svg viewBox="-250 -47.5 500 470" className="shot-chart-svg" preserveAspectRatio="xMidYMid meet">
        {/* Flip y so NBA +y (toward half-court) goes UP on screen */}
        <g transform="scale(1, -1) translate(0, -375)">
          <CourtLines />
          {cells.map((cell) => {
            const [cx, cy] = hexToPixel(cell.q, cell.r, HEX_SIZE)
            const sizeFrac = Math.sqrt(cell.shots / maxShots)  // sqrt scaling
            const size = HEX_SIZE * Math.max(0.3, sizeFrac)
            return (
              <polygon
                key={`${cell.q},${cell.r}`}
                points={hexPolygonPoints(cx, cy, size)}
                fill={colorForDiff(cell.diff)}
                stroke="rgba(0,0,0,0.25)"
                strokeWidth={0.5}
              >
                <title>
                  {cell.shots} FGA · {(cell.fg_pct * 100).toFixed(1)}% FG (League AVG {((cell.fg_pct - cell.diff) * 100).toFixed(1)}% FG)
                </title>
              </polygon>
            )
          })}
        </g>
      </svg>
      <Legend />
    </div>
  )
}