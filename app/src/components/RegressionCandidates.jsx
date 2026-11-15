import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer, Cell, LabelList } from 'recharts'

/**
 * Regression Candidates — flags players whose actual shooting is far from
 * what their shot distribution + league averages would predict.
 *
 * Math (eFG% version):
 *   - For each zone z, lg_fg_pct_z = Σ(fgm) / Σ(fga) across qualified league
 *     players (attempt-weighted, not a mean of per-player %s).
 *   - weight_z = 1.0 for 2-point zones, 1.5 for 3-point zones (eFG convention).
 *   - For a player p:
 *       actual_efg   = Σ(p.fgm_z × weight_z) / Σ p.fga_z
 *       expected_efg = Σ(p.fga_z × lg_fg_pct_z × weight_z) / Σ p.fga_z
 *       delta        = actual_efg - expected_efg
 *   - Positive delta → overperforming (likely to cool off).
 *   - Negative delta → underperforming (likely to heat up).
 *
 * Qualifier: ≥50 total FGA across the five zones (matches the Leaders page
 * floor; keeps small-sample noise out of the top of the table).
 */

const ZONES = [
  { key: 'at_rim',        weight: 1.0 },
  { key: 'paint',         weight: 1.0 },
  { key: 'mid',           weight: 1.0 },
  { key: 'corner_3',      weight: 1.5 },
  { key: 'above_break_3', weight: 1.5 },
]

const MIN_FGA = 50

/**
 * Compute league-average FG% per zone from the pool, attempt-weighted.
 * Uses only players with ≥MIN_FGA to avoid letting 0-attempt noise bias it.
 */
function computeLeagueZonePcts(players) {
  const sums = {}
  for (const z of ZONES) sums[z.key] = { fgm: 0, fga: 0 }
  for (const p of players) {
    const totalFga = ZONES.reduce((a, z) => a + (p.zones?.[z.key]?.fga || 0), 0)
    if (totalFga < MIN_FGA) continue
    for (const z of ZONES) {
      const zone = p.zones?.[z.key]
      if (!zone) continue
      sums[z.key].fgm += zone.fgm || 0
      sums[z.key].fga += zone.fga || 0
    }
  }
  const out = {}
  for (const z of ZONES) {
    out[z.key] = sums[z.key].fga > 0 ? sums[z.key].fgm / sums[z.key].fga : null
  }
  return out
}

/**
 * For one player, given league zone FG%s, compute actual/expected/delta eFG.
 * Returns null if the player doesn't clear MIN_FGA across the five zones.
 */
function evaluatePlayer(player, leagueZonePcts) {
  let totalFga = 0
  let actualWeightedFgm = 0
  let expectedWeightedFgm = 0
  for (const z of ZONES) {
    const zone = player.zones?.[z.key]
    if (!zone) continue
    const fga = zone.fga || 0
    const fgm = zone.fgm || 0
    totalFga += fga
    actualWeightedFgm += fgm * z.weight
    const lgPct = leagueZonePcts[z.key]
    if (lgPct != null) {
      expectedWeightedFgm += fga * lgPct * z.weight
    }
  }
  if (totalFga < MIN_FGA) return null
  const actual = actualWeightedFgm / totalFga
  const expected = expectedWeightedFgm / totalFga
  return { actual, expected, delta: actual - expected, fga: totalFga }
}

const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const fmtPp  = (v) => {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}pp`
}

function SortableTh({ k, label, align, active, dir, onClick }) {
  const indicator = active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''
  return (
    <th
      className={`rc-th ${active ? 'is-active' : ''}`}
      style={{ textAlign: align || 'right', cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onClick(k)}
    >
      {label}{indicator}
    </th>
  )
}

function RegressionTable({ rows, scope }) {
  const [sortKey, setSortKey] = useState('delta')
  const [sortDir, setSortDir] = useState('desc')  // largest overperformers first

  const handleSort = (k) => {
    if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc') }
  }

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...rows]
    copy.sort((a, b) => {
      let av, bv
      if (sortKey === 'name') { av = a.name; bv = b.name }
      else if (sortKey === 'team') { av = a.team || ''; bv = b.team || '' }
      else { av = a[sortKey]; bv = b[sortKey] }
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return av.localeCompare(bv) * dir
      return (av - bv) * dir
    })
    return copy
  }, [rows, sortKey, sortDir])

  if (!sorted.length) {
    return <p className="rc-empty">No qualifying players yet (needs {MIN_FGA}+ FGA on the season).</p>
  }

  return (
    <div className="rc-table-wrap">
      <table className="rc-table">
        <thead>
          <tr>
            <SortableTh k="rank"     label="#"      align="right" active={false} onClick={() => {}} />
            <SortableTh k="name"     label="Player" align="left"  active={sortKey==='name'} dir={sortDir} onClick={handleSort} />
            {scope === 'league' && (
              <SortableTh k="team"   label="Team"   align="left"  active={sortKey==='team'} dir={sortDir} onClick={handleSort} />
            )}
            <SortableTh k="actual"   label="eFG%"       active={sortKey==='actual'}   dir={sortDir} onClick={handleSort} />
            <SortableTh k="expected" label="xeFG%"      active={sortKey==='expected'} dir={sortDir} onClick={handleSort} />
            <SortableTh k="delta"    label="Δ"          active={sortKey==='delta'}    dir={sortDir} onClick={handleSort} />
            <SortableTh k="fga"      label="FGA"        active={sortKey==='fga'}      dir={sortDir} onClick={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const cls = r.delta > 0 ? 'rc-hot' : 'rc-cold'
            return (
              <tr key={r.id} className={cls}>
                <td className="rc-rank">{i + 1}</td>
                <td className="rc-name">
                  {scope === 'hawks' ? (
                    <Link to={`/players/${r.id}`}>{r.name}</Link>
                  ) : (
                    r.name
                  )}
                </td>
                {scope === 'league' && <td className="rc-team">{r.team || '—'}</td>}
                <td className="rc-num">{fmtPct(r.actual)}</td>
                <td className="rc-num rc-dim">{fmtPct(r.expected)}</td>
                <td className={`rc-num rc-delta ${r.delta > 0 ? 'is-hot' : 'is-cold'}`}>
                  {fmtPp(r.delta)}
                </td>
                <td className="rc-num rc-dim">{r.fga}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function RegressionCandidates({ hawksPlayers, leaguePlayers }) {
  const [scope, setScope] = useState('league')

  // Compute league zone averages once (same pool powers both tabs — it's
  // the league baseline we're comparing against, regardless of who we show).
  const leagueZonePcts = useMemo(
    () => computeLeagueZonePcts(leaguePlayers || []),
    [leaguePlayers],
  )

  // League-wide averages for the scatter's crosshair reference lines.
  // We average across every qualified player in the league pool (same
  // 50 FGA floor). xeFG and actual eFG should land at ~the same value
  // (league shooting at league-avg-from-its-own-distribution), but we
  // compute both for honesty and in case the Hawks shot mix would
  // make a meaningful difference later.
  const leagueAverages = useMemo(() => {
    if (!leaguePlayers?.length) return null
    const rs = leaguePlayers
      .map((p) => evaluatePlayer(p, leagueZonePcts))
      .filter(Boolean)
    if (!rs.length) return null
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    return {
      actual: avg(rs.map((r) => r.actual)),
      expected: avg(rs.map((r) => r.expected)),
    }
  }, [leaguePlayers, leagueZonePcts])

  const hawksRows = useMemo(() => {
    return (hawksPlayers || [])
      .map((p) => {
        const r = evaluatePlayer(p, leagueZonePcts)
        if (!r) return null
        return { id: p.id, name: p.name, team: 'ATL', ...r }
      })
      .filter(Boolean)
  }, [hawksPlayers, leagueZonePcts])

  const leagueRows = useMemo(() => {
    return (leaguePlayers || [])
      .map((p) => {
        const r = evaluatePlayer(p, leagueZonePcts)
        if (!r) return null
        return { id: p.id, name: p.name, team: p.team || null, ...r }
      })
      .filter(Boolean)
  }, [leaguePlayers, leagueZonePcts])

  const rows = scope === 'hawks' ? hawksRows : leagueRows

  return (
    <section className="rc-section">
      <header className="rc-head">
        <div>
          <h3 className="rc-title">Regression Candidates</h3>
          <p className="rc-sub">
            Actual eFG% vs expected eFG% from the player's shot distribution ×
            league average per zone. Positive Δ = overperforming (likely to
            cool off). Negative Δ = underperforming (likely to heat up).
            Min {MIN_FGA} FGA on the season.
          </p>
        </div>
        <div className="rc-tabs" role="tablist" aria-label="Regression candidates scope">
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'hawks'}
            className={`rc-tab ${scope === 'hawks' ? 'active' : ''}`}
            onClick={() => setScope('hawks')}
          >
            Hawks
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'league'}
            className={`rc-tab ${scope === 'league' ? 'active' : ''}`}
            onClick={() => setScope('league')}
          >
            League
          </button>
        </div>
      </header>
      <RegressionTable rows={rows} scope={scope} />
      <HawksScatter hawksRows={hawksRows} leagueAverages={leagueAverages} />
    </section>
  )
}

/**
 * Scatter of Hawks players: X = expected eFG% from their shot mix (xeFG),
 * Y = actual eFG%. Reference lines at league averages for both axes carve
 * the plot into quadrants:
 *   top-right    = elite shot quality + outperforming it
 *   top-left     = weaker mix but still scoring efficiently (likely hot)
 *   bottom-right = good mix but missing shots (likely cold / heat up soon)
 *   bottom-left  = low mix AND low conversion — accurately described
 * Dots are colored by delta (actual − expected) so the visual direction
 * matches the table above.
 */
function HawksScatter({ hawksRows, leagueAverages }) {
  if (!hawksRows?.length) return null
  // Scatter data: one dot per Hawks player, with their initials for inline
  // labels (full name shows in the tooltip on hover).
  const data = hawksRows.map((r) => ({
    x: r.expected * 100,   // xeFG as percentage points, easier to axis-format
    y: r.actual * 100,
    delta: (r.delta || 0) * 100,
    name: r.name,
    fga: r.fga,
    initials: r.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3),
  }))
  // Axis bounds with a bit of padding so no dot sits on the edge
  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const vals = [...xs, ...ys]
  if (leagueAverages) {
    vals.push(leagueAverages.actual * 100, leagueAverages.expected * 100)
  }
  const lo = Math.floor((Math.min(...vals) - 2) / 2) * 2
  const hi = Math.ceil((Math.max(...vals) + 2) / 2) * 2
  const ticks = []
  for (let v = lo; v <= hi; v += 2) ticks.push(v)

  return (
    <div className="rc-scatter-wrap">
      <div className="rc-scatter-head">
        <h4 className="rc-scatter-title">Hawks shooting — actual vs expected</h4>
        <p className="rc-scatter-sub">
          Each dot is a Hawks player. Crosshairs mark the league average
          qualified eFG% and xeFG%. Dots above the equal line are overperforming
          their shot distribution; dots below are underperforming.
        </p>
      </div>
      <div className="rc-scatter" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 70, bottom: 36, left: 16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" />
            <XAxis
              type="number"
              dataKey="x"
              name="xeFG%"
              domain={[lo, hi]}
              ticks={ticks}
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              tickFormatter={(v) => `${Math.round(v)}%`}
              label={{ value: 'Expected eFG% (shot distribution × league zones)',
                       position: 'bottom', offset: 12,
                       fill: 'var(--text-dim)', fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="eFG%"
              domain={[lo, hi]}
              ticks={ticks}
              tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
              tickFormatter={(v) => `${Math.round(v)}%`}
              width={44}
              label={{ value: 'Actual eFG%', angle: -90,
                       position: 'left', offset: -6,
                       fill: 'var(--text-dim)', fontSize: 11 }}
            />
            {leagueAverages && (
              <>
                <ReferenceLine
                  x={leagueAverages.expected * 100}
                  stroke="var(--text)" strokeOpacity={0.5} strokeDasharray="3 4"
                  label={{ value: `Lg avg xeFG ${(leagueAverages.expected * 100).toFixed(1)}%`,
                           position: 'insideTopLeft', fill: 'var(--text-dim)', fontSize: 10,
                           offset: 6 }}
                />
                <ReferenceLine
                  y={leagueAverages.actual * 100}
                  stroke="var(--text)" strokeOpacity={0.5} strokeDasharray="3 4"
                  label={{ value: `Lg avg eFG ${(leagueAverages.actual * 100).toFixed(1)}%`,
                           position: 'right', fill: 'var(--text-dim)', fontSize: 10 }}
                />
              </>
            )}
            {/* y=x equal-performance diagonal so you can see over/underperformers
                at a glance regardless of which quadrant they're in. */}
            <ReferenceLine
              segment={[{ x: lo, y: lo }, { x: hi, y: hi }]}
              stroke="var(--text)" strokeOpacity={0.3}
              strokeDasharray="4 4"
            />
            {/* Zero-radius ReferenceDots act as label anchors inside the two
                triangles the diagonal creates. Above the line = actual higher
                than expected = due to regress down. Below the line = actual
                lower than expected = due to improve up. Labels use a muted
                color so they read as guidance, not data. */}
            <ReferenceDot
              x={lo + 0.30 * (hi - lo)}
              y={lo + 0.78 * (hi - lo)}
              r={0}
              ifOverflow="extendDomain"
              label={{
                value: 'Due to regress ↓',
                fill: 'var(--rank-bad-text)',
                fontSize: 11,
                fontWeight: 600,
                opacity: 0.85,
              }}
            />
            <ReferenceDot
              x={lo + 0.78 * (hi - lo)}
              y={lo + 0.22 * (hi - lo)}
              r={0}
              ifOverflow="extendDomain"
              label={{
                value: 'Due to improve ↑',
                fill: 'var(--rank-good-text)',
                fontSize: 11,
                fontWeight: 600,
                opacity: 0.85,
              }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '2 3', stroke: 'var(--border)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload
                const sign = d.delta >= 0 ? '+' : ''
                return (
                  <div className="rc-scatter-tooltip">
                    <div className="rc-tt-name">{d.name}</div>
                    <div className="rc-tt-row">
                      <span>Actual eFG</span><strong>{d.y.toFixed(1)}%</strong>
                    </div>
                    <div className="rc-tt-row">
                      <span>Expected eFG</span><strong>{d.x.toFixed(1)}%</strong>
                    </div>
                    <div className={`rc-tt-row ${d.delta > 0 ? 'rc-tt-hot' : 'rc-tt-cold'}`}>
                      <span>Δ</span>
                      <strong>{sign}{d.delta.toFixed(1)}pp</strong>
                    </div>
                    <div className="rc-tt-row rc-tt-dim">
                      <span>FGA</span><strong>{d.fga}</strong>
                    </div>
                  </div>
                )
              }}
            />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.delta >= 0 ? 'var(--rank-good-text)' : 'var(--rank-bad-text)'}
                  r={6}
                />
              ))}
              <LabelList dataKey="initials" position="right" offset={6}
                         style={{ fill: 'var(--text-h)', fontSize: 10, fontFamily: 'var(--mono)' }} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
