import { useMemo, useState } from 'react'

// ─── Section config ─────────────────────────────────────────
// Three top-level sections (Shooting, Defense, Hustle) chosen by the
// section toggle. Each stat carries `source` — one of `overall`, `zones`,
// `defense`, `hustle` — which tells the data-shape adapters below which
// path to read from. This decouples the VISUAL section from the DATA
// SHAPE, so "Shooting" can mix overall-shooting stats and zone stats
// without special-casing either one.

const SECTION_CONFIG = {
  shooting: {
    title: 'Shooting',
    stats: [
      // Row 1 — headline %s
      { key: 'fg_pct',  label: 'FG%',  source: 'overall', attempts: 'fga',  attemptsLabel: 'FGA' },
      { key: 'fg3_pct', label: '3P%',  source: 'overall', attempts: 'fg3a', attemptsLabel: '3PA' },
      { key: 'ft_pct',  label: 'FT%',  source: 'overall', attempts: 'fta',  attemptsLabel: 'FTA' },
      // Row 2 — advanced shooting + rim
      { key: 'ts_pct',  label: 'TS%',  source: 'overall', attempts: 'fga',  attemptsLabel: 'FGA' },
      { key: 'efg_pct', label: 'eFG%', source: 'overall', attempts: 'fga',  attemptsLabel: 'FGA' },
      { key: 'at_rim',  label: 'At the Rim', source: 'zones' },
      // Row 3 — mid-paint zones
      { key: 'paint',    label: 'In the Paint', source: 'zones' },
      { key: 'mid',      label: 'Mid-Range',    source: 'zones' },
      { key: 'corner_3', label: 'Corner 3',     source: 'zones' },
      // Row 4 — deep 3s
      { key: 'above_break_3', label: 'Above the Break 3', source: 'zones' },
    ],
  },
  defense: {
    title: 'Defense',
    stats: [
      { key: 'spg',     label: 'Steals Per Game',   source: 'defense' },
      { key: 'bpg',     label: 'Blocks Per Game',   source: 'defense' },
      { key: 'rpg',     label: 'Rebounds Per Game', source: 'defense' },
      // Advanced defense %s. Hawks carry these at the top level
      // (stl_pct, blk_pct, reb_pct); league players carry them under
      // player.defense.<key>. The getValue adapter handles both.
      { key: 'stl_pct', label: 'STL%', source: 'defense', format: 'pct' },
      { key: 'blk_pct', label: 'BLK%', source: 'defense', format: 'pct' },
      { key: 'reb_pct', label: 'REB%', source: 'defense', format: 'pct' },
    ],
  },
  hustle: {
    title: 'Hustle',
    stats: [
      { key: 'deflections',           label: 'Deflections',           source: 'hustle' },
      { key: 'contested_shots',       label: 'Contested Shots',       source: 'hustle' },
      { key: 'box_outs',              label: 'Box Outs',              source: 'hustle' },
      { key: 'loose_balls_recovered', label: 'Loose Balls Recovered', source: 'hustle' },
      { key: 'charges_drawn',         label: 'Charges Drawn',         source: 'hustle' },
      { key: 'screen_assists',        label: 'Screen Assists',        source: 'hustle' },
    ],
  },
}

const TOP_N = 10

// ─── Shape adapters ─────────────────────────────────────────
// Each player object has two possible shapes depending on which tab is
// active:
//   - Hawks tab (hawksData): fields are flat on the player (fg_pct, spg)
//     or nested under player.hustle.<field>.value for hustle metrics.
//   - League tab (league_leaderboards): nested under player.overall,
//     player.defense, player.hustle. Hustle values are stored directly
//     (not wrapped in {value, pctile} like the Hawks file).
// These helpers hide the difference from the Leaderboard component.
// Now take `source` directly (no longer tied to the outer section name).

function getValue(player, source, statKey, mode = 'per-game') {
  if (source === 'zones') return player.zones?.[statKey]?.pct ?? null
  if (source === 'overall') {
    const d = player.overall ?? player
    return d[statKey] ?? null
  }
  if (source === 'defense') {
    const d = player.defense ?? player
    return d[statKey] ?? null
  }
  if (source === 'hustle') {
    const raw = player.hustle?.[statKey]
    if (raw == null) return null
    const perGame = typeof raw === 'object' ? raw.value : raw
    if (mode !== 'per-36') return perGame
    // Per-36 = per-game × 36 ÷ mpg. Guard against zero/missing mpg so a
    // player who hasn't logged minutes doesn't blow up to Infinity.
    const mpg = player.mpg ?? 0
    if (!mpg) return null
    return (perGame * 36) / mpg
  }
  return null
}

function getAttempts(player, source, stat) {
  if (source === 'zones') return player.zones?.[stat.key]?.fga ?? null
  if (source === 'overall') {
    const d = player.overall ?? player
    // Prefer the pre-computed season total; fall back to per-game only
    // (older cached data between daily refreshes).
    return d[`${stat.attempts}_total`] ?? d[stat.attempts] ?? null
  }
  return null
}

function getVolumeCell(player, source, stat) {
  if (source === 'zones') {
    const z = player.zones?.[stat.key]
    return z ? `${z.fgm}/${z.fga}` : ''
  }
  if (source === 'overall') {
    const d = player.overall ?? player
    const a = d[`${stat.attempts}_total`] ?? d[stat.attempts] ?? 0
    return Math.round(a)
  }
  return null
}

function formatValue(v, source, stat) {
  if (v == null) return '—'
  // Explicit per-stat format wins (e.g. Defense's STL%/BLK%/REB%).
  if (stat?.format === 'pct') return `${(v * 100).toFixed(1)}%`
  if (source === 'zones' || source === 'overall') return `${(v * 100).toFixed(1)}%`
  return v.toFixed(1)
}

function getFloor(source, stat, leaderboards) {
  if (source === 'zones') return leaderboards?.min_fga_per_zone?.[stat.key] ?? null
  if (source === 'overall') return leaderboards?.min_overall?.[stat.key]?.min ?? 50
  return null
}

function floorLabel(source, stat, floor) {
  if (floor == null) return null
  if (source === 'zones') return `min ${floor} FGA`
  if (source === 'overall') return `min ${floor} ${stat.attemptsLabel}`
  return null
}

function valueHeader(source, stat, mode = 'per-game') {
  if (source === 'zones') return 'FG%'
  if (source === 'overall') return stat.label
  // Defense's %-based rates (STL%/BLK%/REB%) use '%' instead of '/G'.
  if (source === 'defense' && stat?.format === 'pct') return '%'
  // Short header so the column fits in the narrow mobile width without
  // wrapping. Card title above names the metric in full. Hustle flips to
  // /36 when the section is in Per 36 mode.
  if (source === 'hustle' && mode === 'per-36') return '/36'
  return '/G'
}

function volumeHeader(source, stat) {
  if (source === 'zones') return 'M/A'
  if (source === 'overall') return stat.attemptsLabel
  return null
}

// ─── Main page ──────────────────────────────────────────────

export default function LeadersPage({ leaderboards, playerData }) {
  const [source, setSource] = useState('hawks')
  const [activeSection, setActiveSection] = useState('shooting')
  // Hustle-only Per Game / Per 36 toggle. Keeping it per-section (not
  // global) so the Shooting + Defense sections stay single-mode and don't
  // get a confusing toggle that doesn't apply to %-based stats.
  const [hustleMode, setHustleMode] = useState('per-game')

  if (!leaderboards) {
    return (
      <div className="leaders-empty">
        <p>Leaderboards are being generated. Check back after the next data refresh.</p>
      </div>
    )
  }

  const players =
    source === 'league'
      ? leaderboards.players
      : (playerData?.players || [])

  const title = source === 'league' ? 'League Leaders' : 'Hawks Leaders'
  const sub =
    source === 'league'
      ? `Top ${TOP_N} · minimum ${leaderboards.min_gp} GP`
      : `Top ${TOP_N} Hawks`

  const section = SECTION_CONFIG[activeSection]

  return (
    <div className="leaders-page">
      {/* Hawks / League toggle — stays at top. */}
      <div className="leaders-toggle">
        <button
          type="button"
          className={`leaders-toggle-btn ${source === 'hawks' ? 'active' : ''}`}
          onClick={() => setSource('hawks')}
        >
          Hawks
        </button>
        <button
          type="button"
          className={`leaders-toggle-btn ${source === 'league' ? 'active' : ''}`}
          onClick={() => setSource('league')}
        >
          League
        </button>
      </div>

      {/* Section toggle — sits under the Hawks/League row. */}
      <div className="leaders-toggle leaders-section-toggle">
        {Object.keys(SECTION_CONFIG).map((key) => (
          <button
            key={key}
            type="button"
            className={`leaders-toggle-btn ${activeSection === key ? 'active' : ''}`}
            onClick={() => setActiveSection(key)}
          >
            {SECTION_CONFIG[key].title}
          </button>
        ))}
      </div>

      <header className="leaders-header">
        <h2>{title} — {section.title}</h2>
        <p className="leaders-sub">{sub}</p>
        <p className="leaders-note">
          Leaderboards update daily. Early-season samples may be noisy.
        </p>
      </header>

      {/* Per Game / Per 36 toggle — Hustle section only. Shooting (%-based)
          and Defense (per-game STL/BLK/REB only) don't use it. */}
      {activeSection === 'hustle' && (
        <div className="leaders-mode-toggle">
          <button
            type="button"
            className={`leaders-mode-btn ${hustleMode === 'per-game' ? 'active' : ''}`}
            onClick={() => setHustleMode('per-game')}
          >
            Per Game
          </button>
          <button
            type="button"
            className={`leaders-mode-btn ${hustleMode === 'per-36' ? 'active' : ''}`}
            onClick={() => setHustleMode('per-36')}
          >
            Per 36
          </button>
        </div>
      )}

      {/* All leaderboards for the active section, 3 per row on desktop,
          1 per row on mobile. */}
      <div className="leaders-grid">
        {section.stats.map((stat) => (
          <Leaderboard
            key={stat.key}
            stat={stat}
            players={players}
            leaderboards={leaderboards}
            mode={activeSection === 'hustle' ? hustleMode : 'per-game'}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Single leaderboard card ────────────────────────────────

function Leaderboard({ stat, players, leaderboards, mode = 'per-game' }) {
  const source = stat.source
  const floor = getFloor(source, stat, leaderboards)
  const vHeader = valueHeader(source, stat, mode)
  const volHeader = volumeHeader(source, stat)

  const topPlayers = useMemo(() => {
    return players
      .map((p) => ({
        p,
        value: getValue(p, source, stat.key, mode),
        attempts: getAttempts(p, source, stat),
      }))
      .filter((row) => {
        if (row.value == null) return false
        if (floor != null && (row.attempts == null || row.attempts < floor)) return false
        return true
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
  }, [players, source, stat.key, stat.attempts, floor, mode])

  const subLabel = floorLabel(source, stat, floor)
  const colSpan = volHeader ? 5 : 4

  return (
    <section className="leader-card">
      <h3 className="leader-card-title">{stat.label}</h3>
      {subLabel && <p className="leader-card-sub">{subLabel}</p>}
      <table className="leader-table">
        <thead>
          <tr>
            <th className="col-rank">#</th>
            <th className="col-player">Player</th>
            <th className="col-team">Team</th>
            <th className="col-pct">{vHeader}</th>
            {volHeader && <th className="col-vol">{volHeader}</th>}
          </tr>
        </thead>
        <tbody>
          {topPlayers.map((row, i) => (
            <tr key={row.p.id}>
              <td className="col-rank">{i + 1}</td>
              <td className="col-player">{row.p.name}</td>
              <td className="col-team">{row.p.team || 'ATL'}</td>
              <td className="col-pct">{formatValue(row.value, source, stat)}</td>
              {volHeader && (
                <td className="col-vol">{getVolumeCell(row.p, source, stat)}</td>
              )}
            </tr>
          ))}
          {topPlayers.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="leader-empty">
                No qualifying players.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
