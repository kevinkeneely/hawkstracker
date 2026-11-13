import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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
    </section>
  )
}
