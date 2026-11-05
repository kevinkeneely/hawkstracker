import { useEffect, useRef, useState } from 'react'

// NBA shot coordinate system:
//   x: -250 (left) to +250 (right), 1 unit = 0.1 ft
//   y: -47.5 (behind backboard) to 422.5 (half court)
//   hoop center at (0, 0)

const HEX_SIZE = 22          // MUST match pipeline/transform_league_baseline.py
const MIN_SHOTS_PER_HEX = 1  // TEMP early-season — was 3. Raise back when players have enough cluster volume (~mid-Nov). See post-launch-followups.md #5

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
      <line x1={-220} y1={-47.5} x2={-220} y2={89.5} />
      <line x1={220} y1={-47.5} x2={220} y2={89.5} />
      <path d="M -220 89.5 A 237.5 237.5 0 0 0 220 89.5" />
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

// ──────────────── Heat map view (density canvas + court overlay) ────────────────

const HEATMAP_RADIUS = 22  // in NBA coord units; wider = smoother blobs
const CANVAS_W = 500
const CANVAS_H = 470

// Classic blue→cyan→green→yellow→red ramp. t in [0, 1].
function fgColor(pct) {
  // Map FG% to color. NBA avg is ~46%; we scale 20%–70% across the ramp.
  const t = Math.max(0, Math.min(1, (pct - 0.2) / 0.5))
  const stops = [
    { at: 0.00, c: [40, 50, 180] },   // blue — poor shooter
    { at: 0.30, c: [0, 180, 220] },   // cyan
    { at: 0.55, c: [80, 200, 60] },   // green — league avg-ish
    { at: 0.75, c: [250, 220, 50] },  // yellow
    { at: 1.00, c: [220, 30, 30] },   // red — elite from this spot
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t <= b.at) {
      const u = (t - a.at) / (b.at - a.at)
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * u),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * u),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * u),
      ]
    }
  }
  const last = stops[stops.length - 1].c
  return [last[0], last[1], last[2]]
}

function HeatmapView({ shots, zones }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !shots) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Build two offscreen density canvases: all attempts, and makes only
    const mkDensity = (filter) => {
      const c = document.createElement('canvas')
      c.width = CANVAS_W
      c.height = CANVAS_H
      const cc = c.getContext('2d')
      cc.globalCompositeOperation = 'lighter'
      for (const s of shots) {
        if (filter && !s.made) continue
        const px = s.x + 250
        const py = CANVAS_H - (s.y + 47.5)
        const g = cc.createRadialGradient(px, py, 0, px, py, HEATMAP_RADIUS)
        g.addColorStop(0, 'rgba(0,0,0,0.35)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        cc.fillStyle = g
        cc.beginPath()
        cc.arc(px, py, HEATMAP_RADIUS, 0, Math.PI * 2)
        cc.fill()
      }
      return cc.getImageData(0, 0, CANVAS_W, CANVAS_H).data
    }

    const attempts = mkDensity(false)   // all shots
    const makes = mkDensity(true)       // made shots only

    // Normalize attempts for opacity
    let maxA = 1
    for (let i = 3; i < attempts.length; i += 4) {
      if (attempts[i] > maxA) maxA = attempts[i]
    }

    // Compose: color = FG% (makes/attempts), opacity = attempt density
    const out = ctx.createImageData(CANVAS_W, CANVAS_H)
    for (let i = 0; i < out.data.length; i += 4) {
      const aA = attempts[i + 3]
      if (aA < 10) {
        out.data[i + 3] = 0
        continue
      }
      const mA = makes[i + 3]
      const pct = mA / aA
      const [r, g, b] = fgColor(pct)
      const opacityT = Math.min(1, aA / maxA)
      out.data[i] = r
      out.data[i + 1] = g
      out.data[i + 2] = b
      out.data[i + 3] = Math.round(60 + 180 * opacityT)
    }
    ctx.putImageData(out, 0, 0)
  }, [shots])

  return (
    <div className="shot-chart-stage">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="shot-chart-heatmap-canvas"
      />
      <svg
        viewBox="-250 -47.5 500 470"
        className="shot-chart-heatmap-court"
        preserveAspectRatio="none"
      >
        <g transform="scale(1, -1) translate(0, -375)">
          <CourtLines />
        </g>
        {zones && <ZoneLabels zones={zones} />}
      </svg>
    </div>
  )
}

function HeatmapLegend() {
  return (
    <div className="shot-chart-legend">
      <div className="legend-row">
        <span className="legend-label">FG%:</span>
        <div className="legend-gradient heatmap-gradient" />
      </div>
      <div className="legend-row">
        <span className="legend-label-small">20%</span>
        <span className="legend-label-small heatmap-hot">70%</span>
      </div>
    </div>
  )
}

function ZoneLabels({ zones }) {
  const fmt = (z) => (z?.pct == null ? '—' : `${(z.pct * 100).toFixed(1)}%`)
  // Positions in viewBox coords (y: 0=top, 422=bottom; baseline sits at bottom)
  const labels = [
    { x: 0,    y: 355, text: fmt(zones.at_rim) },
    { x: 0,    y: 275, text: fmt(zones.paint) },
    { x: 0,    y: 195, text: fmt(zones.mid) },
    { x: 0,    y: 115, text: fmt(zones.above_break_3) },
    { x: -225, y: 355, text: fmt(zones.l_corner_3) },
    { x: 225,  y: 355, text: fmt(zones.r_corner_3) },
  ]
  return (
    <g>
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          stroke="rgba(0,0,0,0.85)"
          strokeWidth={4}
          paintOrder="stroke"
          fontSize={16}
          fontWeight={700}
          style={{ pointerEvents: 'none' }}
        >
          {l.text}
        </text>
      ))}
    </g>
  )
}

// ──────────────── Main component ────────────────
// ──────────────── Shot Density view ────────────────────────────
// Hex-binned density of every FGA — cells colored on a plasma-style ramp
// (deep purple = few shots, through magenta/orange, to bright yellow =
// heaviest concentration). Pure volume view: no make/miss, no league
// comparison. Reuses the same HEX_SIZE grid as HexView so bin boundaries
// line up across views.
//
// Plasma colormap sampled at 6 stops. Matched roughly to matplotlib's
// plasma so the result reads as the familiar density palette.
function densityColor(t) {
  // t in [0, 1]. Below 0.001 treated as no shots (transparent).
  if (t == null || t <= 0) return 'transparent'
  const stops = [
    { at: 0.00, c: [ 13,   8, 135] },  // deep purple
    { at: 0.20, c: [ 75,   3, 161] },  // purple
    { at: 0.40, c: [156,  23, 158] },  // magenta
    { at: 0.60, c: [218,  65, 121] },  // pink-coral
    { at: 0.80, c: [247, 148,  58] },  // orange
    { at: 1.00, c: [240, 249,  33] },  // bright yellow
  ]
  const u = Math.max(0, Math.min(1, t))
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]; const b = stops[i + 1]
    if (u <= b.at) {
      const k = (u - a.at) / (b.at - a.at)
      const r = Math.round(a.c[0] + (b.c[0] - a.c[0]) * k)
      const g = Math.round(a.c[1] + (b.c[1] - a.c[1]) * k)
      const bl = Math.round(a.c[2] + (b.c[2] - a.c[2]) * k)
      return `rgb(${r}, ${g}, ${bl})`
    }
  }
  const last = stops[stops.length - 1].c
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}

// Finer-grained hex grid for the density view — smaller than the shared
// HEX_SIZE (22) used by HexView and the league baseline, so density reads
// as a smoother gradient instead of blocky patches. Local to this view so
// it doesn't affect HexView or break the pipeline alignment.
const DENSITY_HEX_SIZE = 12

function DensityView({ shots }) {
  // Bin every shot into DENSITY_HEX_SIZE cells. No league floor — a single
  // shot in a cell still counts (deep purple on the ramp).
  const cellMap = new Map()
  for (const s of shots) {
    const [q, r] = pixelToHex(s.x, s.y, DENSITY_HEX_SIZE)
    const key = `${q},${r}`
    const cell = cellMap.get(key) || { q, r, shots: 0 }
    cell.shots += 1
    cellMap.set(key, cell)
  }
  const cells = Array.from(cellMap.values())
  const maxShots = cells.reduce((m, c) => Math.max(m, c.shots), 1)

  return (
    <>
      <svg viewBox="-250 -47.5 500 470" className="shot-chart-svg" preserveAspectRatio="xMidYMid meet">
        <g transform="scale(1, -1) translate(0, -375)">
          <CourtLines />
          {cells.map((cell) => {
            const [cx, cy] = hexToPixel(cell.q, cell.r, DENSITY_HEX_SIZE)
            // Normalize to max cell — the hottest spot is always bright yellow,
            // everything else scales down from there. Square-root compresses
            // the long tail so sparse cells don't all look identically dark.
            const t = Math.sqrt(cell.shots / maxShots)
            return (
              <polygon
                key={`${cell.q},${cell.r}`}
                points={hexPolygonPoints(cx, cy, DENSITY_HEX_SIZE)}
                fill={densityColor(t)}
                stroke="rgba(0, 0, 0, 0.25)"
                strokeWidth={0.3}
              >
                <title>{cell.shots} FGA</title>
              </polygon>
            )
          })}
        </g>
      </svg>
    </>
  )
}

// Plasma-ramp legend for the Shot Density view. Mirrors HeatmapLegend's
// structure so the two legends feel the same visually.
function DensityLegend() {
  return (
    <div className="shot-chart-legend">
      <div className="legend-row">
        <span className="legend-label">Shot volume:</span>
        <div className="legend-gradient density-gradient" />
      </div>
      <div className="legend-row">
        <span className="legend-label-small">Few shots</span>
        <span className="legend-label-small density-hot">Most shots</span>
      </div>
    </div>
  )
}

// ──────────────── Shot Chart view (Makes & Misses) ──────────────
// Every FGA plotted individually — green filled circle for a make, red X
// for a miss. The simplest, most literal shot chart. No binning, no
// efficiency math. Uses the same viewBox + flip transform as the other
// three views so a shot at NBA (x, y) lands at the same court spot.
const MAKE_COLOR = '#22c55e'   // green (filled circle)
const MISS_COLOR = '#C8102E'   // Hawks red (X)

function MakesMissesView({ shots }) {
  return (
    <>
      <svg viewBox="-250 -47.5 500 470" className="shot-chart-svg" preserveAspectRatio="xMidYMid meet">
        <g transform="scale(1, -1) translate(0, -375)">
          <CourtLines />
          {shots.map((s, i) => {
            const title = `${s.made ? 'Make' : 'Miss'} · ${s.type} · ${s.dist} ft${s.zone ? ' · ' + s.zone : ''}`
            if (s.made) {
              return (
                <circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={5}
                  fill={MAKE_COLOR}
                  stroke="rgba(0, 0, 0, 0.6)"
                  strokeWidth={0.6}
                  opacity={0.9}
                >
                  <title>{title}</title>
                </circle>
              )
            }
            // Miss: draw an X as two crossed line segments. r = half the X's
            // bounding size. Thicker stroke so misses read as weighted as the
            // filled circles do for makes.
            const r = 5
            return (
              <g key={i} opacity={0.9}>
                <line x1={s.x - r} y1={s.y - r} x2={s.x + r} y2={s.y + r}
                      stroke={MISS_COLOR} strokeWidth={1.8} strokeLinecap="round" />
                <line x1={s.x - r} y1={s.y + r} x2={s.x + r} y2={s.y - r}
                      stroke={MISS_COLOR} strokeWidth={1.8} strokeLinecap="round" />
                <title>{title}</title>
              </g>
            )
          })}
        </g>
      </svg>
    </>
  )
}

// Legend for the Shot Chart (makes & misses) view.
function MakesMissesLegend() {
  return (
    <div className="shot-chart-legend">
      <div className="legend-row">
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
          <circle cx={7} cy={7} r={5} fill={MAKE_COLOR} stroke="rgba(0,0,0,0.6)" strokeWidth={0.6} />
        </svg>
        <span className="legend-label-small">Make</span>
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ marginLeft: 12, flexShrink: 0 }}>
          <line x1={2} y1={2} x2={12} y2={12} stroke={MISS_COLOR} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={2} y1={12} x2={12} y2={2} stroke={MISS_COLOR} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        <span className="legend-label-small">Miss</span>
      </div>
    </div>
  )
}

export default function ShotChart({ playerId, season, leagueBaseline, zones }) {
  const [shots, setShots] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('makes') // 'makes' | 'heatmap' | 'hex' | 'density'

  useEffect(() => {
    setShots(null)
    setError(null)
    fetch(`/shots/${playerId}-${season}.json`)
      .then((r) => {
        if (!r.ok) throw new Error('no shot data')
        return r.json()
      })
      .then(setShots)
      .catch((e) => setError(e.message))
  }, [playerId, season])

  if (error) return <div className="shot-chart-empty">No shot data available.</div>
  if (!shots) return <div className="shot-chart-empty">Loading shot chart…</div>
  if (view === 'hex' && !leagueBaseline) {
    return <div className="shot-chart-empty">Loading league baseline…</div>
  }

  return (
    <div className="shot-chart">
      <div className="shot-chart-toggle">
        <button
          type="button"
          className={`shot-chart-toggle-btn ${view === 'makes' ? 'active' : ''}`}
          onClick={() => setView('makes')}
        >
          Shot Chart
        </button>
        <button
          type="button"
          className={`shot-chart-toggle-btn ${view === 'heatmap' ? 'active' : ''}`}
          onClick={() => setView('heatmap')}
        >
          Heat Map
        </button>
        <button
          type="button"
          className={`shot-chart-toggle-btn ${view === 'hex' ? 'active' : ''}`}
          onClick={() => setView('hex')}
        >
          Hex Chart
        </button>
        <button
          type="button"
          className={`shot-chart-toggle-btn ${view === 'density' ? 'active' : ''}`}
          onClick={() => setView('density')}
        >
          Shot Density
        </button>
      </div>

      {view === 'makes' && (
        <>
          <MakesMissesView shots={shots} />
          <MakesMissesLegend />
        </>
      )}
      {view === 'hex' && (
        <HexView shots={shots} leagueBaseline={leagueBaseline} />
      )}
      {view === 'heatmap' && (
        <>
          <HeatmapView shots={shots} zones={zones} />
          <HeatmapLegend />
        </>
      )}
      {view === 'density' && (
        <>
          <DensityView shots={shots} />
          <DensityLegend />
        </>
      )}
    </div>
  )
}

function HexView({ shots, leagueBaseline }) {
  const leagueByHex = {}
  for (const h of leagueBaseline.hexes) {
    leagueByHex[`${h.q},${h.r}`] = h.fg_pct
  }

  const cellMap = new Map()
  for (const s of shots) {
    const [q, r] = pixelToHex(s.x, s.y, HEX_SIZE)
    const key = `${q},${r}`
    const cell = cellMap.get(key) || { q, r, shots: 0, makes: 0 }
    cell.shots += 1
    cell.makes += s.made
    cellMap.set(key, cell)
  }

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
    <>
      <svg viewBox="-250 -47.5 500 470" className="shot-chart-svg" preserveAspectRatio="xMidYMid meet">
        <g transform="scale(1, -1) translate(0, -375)">
          <CourtLines />
          {cells.map((cell) => {
            const [cx, cy] = hexToPixel(cell.q, cell.r, HEX_SIZE)
            const sizeFrac = Math.sqrt(cell.shots / maxShots)
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
    </>
  )
}